/* ── Cloud project store ──────────────────────────────────────────────────
   Named projects live in Firestore under users/{uid}/projects/{projectId} so
   they follow the signed-in user between devices. Classic script, loaded before
   engine.js: nothing here runs at top level beyond wiring one event listener,
   and every function it publishes is only reachable from a user action.

   Boundaries worth knowing before editing:

   • This file never touches simulator state. It moves opaque payloads. Building
     one is buildSaveData()'s job and applying one is applyLoadedCircuit()'s job,
     and both stay in engine.js. A Firestore document is exactly as untrusted as
     a localStorage entry or a picked file, so it goes home through that same
     single restore path — do not add a second one here.

   • The local autosave (`ac-simulator-circuit`, written from 66 call sites in
     the app) is deliberately NOT mirrored here. It is the crash-recovery layer
     for the working circuit, which is a different thing from a named project.
     Wiring it to Firestore would bill a document write per component drag. The
     only writes this file makes are the five explicit user actions below:
     create, overwrite, rename, delete, import.

   • The Firebase SDK arrives over the network some time after the page does
     (see auth.js), and the account arrives later still. So this starts in a
     'connecting' state, and every consumer has to render that honestly rather
     than assuming an empty list means the user has no projects.

   • Firestore is reached through a swappable driver. The regression harness
     frames the app with ?tbtest=1, which stands the auth gate down and means
     Firebase never initializes there at all — without a seam the cloud paths
     would be permanently untestable. See __setDriver().
   ──────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const SDK_BASE     = 'https://www.gstatic.com/firebasejs/10.14.1/';
  const MAX_NAME     = 120;        // also enforced in firestore.rules
  const MAX_DOC_BYTES = 900 * 1024; // Firestore's hard ceiling is 1 MiB
  let writeTimeout = 8000;         // past this a write is assumed queued offline

  /* State machine consumers render against. 'connecting' is the honest answer
     between page load and the first auth verdict — it is not 'signed-out', and
     showing an empty project list during it would read as data loss. */
  let status  = 'connecting';   // connecting | signed-out | ready | error
  let lastErr = null;
  let uid     = null;
  let db      = null;
  let sdkLoad = null;           // in-flight SDK promise, so we load it once

  const listeners = [];
  function notify() {
    for (const fn of listeners.slice()) {
      try { fn(status, uid); } catch (e) { console.warn('[cloud] listener threw', e); }
    }
  }
  function setStatus(next, err) {
    if (status === next && !err) return;
    status = next;
    lastErr = err || null;
    notify();
  }

  /* ── Driver ──────────────────────────────────────────────────────────────
     Every Firestore call in this file goes through here. Swapping it is what
     lets the regression suite exercise list/create/rename/delete/conflict and
     the malformed-document paths without a network or an account. */
  const firestoreDriver = {
    collection() {
      return db.collection('users').doc(uid).collection('projects');
    },
    list() {
      return this.collection().orderBy('updatedAt', 'desc').get()
        .then(snap => snap.docs.map(d => ({ id: d.id, data: d.data() })));
    },
    get(id) {
      return this.collection().doc(id).get()
        .then(d => (d.exists ? { id: d.id, data: d.data() } : null));
    },
    create(data) {
      return this.collection().add(data).then(ref => ref.id);
    },
    update(id, patch) {
      return this.collection().doc(id).update(patch);
    },
    remove(id) {
      return this.collection().doc(id).delete();
    },
    stamp() {
      return firebase.firestore.FieldValue.serverTimestamp();
    }
  };
  let driver = firestoreDriver;

  /* ── Helpers ── */

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Could not load ' + src));
      document.head.appendChild(s);
    });
  }

  /* Firestore rejects `undefined` outright, and buildSaveData() reads panel
     geometry off the DOM — a panel that has never been positioned yields
     undefined rather than the null the schema expects. Rather than chase every
     such field, drop them here: an absent field and an undefined one mean the
     same thing to the restore path, which treats every field as optional. */
  function stripUndefined(v) {
    if (Array.isArray(v)) return v.map(stripUndefined);
    if (v && typeof v === 'object') {
      const out = {};
      for (const k of Object.keys(v)) {
        if (v[k] === undefined) continue;
        out[k] = stripUndefined(v[k]);
      }
      return out;
    }
    return v === undefined ? null : v;
  }

  /* A write that has not resolved by now is almost certainly sitting in
     Firestore's offline queue rather than failing — with persistence on, set()
     and update() do not settle until the server acknowledges, which never
     happens while the network is down. Reporting that as an error would be a
     lie (the write is durable locally and will sync), and blocking the dialog
     on it would be worse. Resolve as 'queued' and let the caller say so. */
  function withTimeout(promise) {
    let done = false;
    /* If the write eventually fails after we have already reported it queued,
       nobody is left holding the promise — and an unattended rejection is a
       console error the user cannot act on. Swallow it to a warning here rather
       than letting it surface as an unhandled rejection. */
    const settled = promise.then(
      v => { done = true; return { ok: true, value: v }; },
      e => {
        if (done) throw e;
        if (timedOut) { console.warn('[cloud] queued write later failed', e); return { ok: false, value: null }; }
        throw e;
      }
    );
    let timedOut = false;
    return Promise.race([
      settled,
      new Promise(resolve => setTimeout(() => {
        if (!done) { timedOut = true; resolve({ ok: true, queued: true, value: null }); }
      }, writeTimeout))
    ]);
  }

  function cleanName(name) {
    const t = String(name == null ? '' : name).trim();
    return t.slice(0, MAX_NAME);
  }

  function payloadSize(obj) {
    try { return JSON.stringify(obj).length; } catch (e) { return Infinity; }
  }

  function requireReady() {
    if (status === 'ready') return null;
    if (status === 'connecting') return new Error('Still connecting to your account.');
    if (status === 'signed-out') return new Error('You are not signed in.');
    return lastErr || new Error('Cloud projects are unavailable.');
  }

  /* ── Reading a document ──────────────────────────────────────────────────
     A Firestore document is untrusted input. It can be stale, it can predate a
     schema change, and — because the rules validate types but deliberately do
     not walk the circuit — it can be hand-written by the account's own owner
     through the API. This vets the *envelope* only: that there is a usable name
     and that `circuit` is a plain object worth handing on. The circuit itself
     stays the job of sanitizeComponents/sanitizeWires/applySavedCamera and the
     rest of the restore path, exactly as for localStorage. */
  function readEnvelope(id, data) {
    if (!data || typeof data !== 'object') return null;
    const name = typeof data.name === 'string' && data.name.trim()
      ? data.name.trim().slice(0, MAX_NAME)
      : 'Untitled Project';
    /* An array would spread into the restore path as index keys; a scalar would
       throw. Either way it is not a circuit. Keep the row so the user can still
       see and delete it, but hand on an empty object so the sanitizers below
       produce an empty canvas rather than the loader exploding. */
    const raw = data.circuit;
    const circuit = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : null;
    return {
      id: id,
      name: name,
      circuit: circuit,
      /* serverTimestamp() reads back null from the local cache until the server
         acknowledges the write, so a freshly created project legitimately has
         no updatedAt for a moment. Callers must not treat null as "very old". */
      updatedAt: toMillis(data.updatedAt),
      createdAt: toMillis(data.createdAt),
      schemaVersion: typeof data.schemaVersion === 'number' && isFinite(data.schemaVersion)
        ? data.schemaVersion : null,
      componentCount: Array.isArray(raw && raw.components) ? raw.components.length : 0,
      wireCount:      Array.isArray(raw && raw.wires)      ? raw.wires.length      : 0
    };
  }

  function toMillis(ts) {
    if (!ts) return null;
    if (typeof ts.toMillis === 'function') { try { return ts.toMillis(); } catch (e) { return null; } }
    if (typeof ts.seconds === 'number') return ts.seconds * 1000;
    if (typeof ts === 'number' && isFinite(ts)) return ts;
    return null;
  }

  /* ── Public API ── */

  const api = {
    status:  () => status,
    uid:     () => uid,
    error:   () => lastErr,
    maxName: MAX_NAME,

    onChange(fn) {
      if (typeof fn === 'function') listeners.push(fn);
    },

    /* Returns rows for the project list. Rejects rather than returning [] when
       the store is unreachable — an empty list and a failed read must not look
       the same to the user. */
    list() {
      const err = requireReady();
      if (err) return Promise.reject(err);
      return driver.list().then(rows =>
        rows.map(r => readEnvelope(r.id, r.data)).filter(Boolean)
      );
    },

    get(id) {
      const err = requireReady();
      if (err) return Promise.reject(err);
      return driver.get(id).then(r => (r ? readEnvelope(r.id, r.data) : null));
    },

    /* Create a new project. The document id is Firestore's, never the name —
       names collide and names change, and a renamed project must stay the same
       project on every device. */
    create(name, circuit) {
      const err = requireReady();
      if (err) return Promise.reject(err);
      const clean = cleanName(name);
      if (!clean) return Promise.reject(new Error('A project needs a name.'));
      const body = buildBody(circuit);
      if (body instanceof Error) return Promise.reject(body);
      return withTimeout(driver.create({
        name: clean,
        circuit: body,
        schemaVersion: (typeof SAVE_FORMAT_VERSION === 'number') ? SAVE_FORMAT_VERSION : 1,
        createdAt: driver.stamp(),
        updatedAt: driver.stamp()
      })).then(r => ({ id: r.value, queued: !!r.queued }));
    },

    /* Overwrite an existing project's circuit. `seenUpdatedAt` is what the
       caller last saw for this document; if the stored copy has moved past it,
       another device saved in between and this write would silently discard it.
       Report that rather than resolving the race by luck. */
    /* Caveat worth knowing: with offline persistence on, this read can be
       served from the local cache, so while the device is offline the check
       compares against the last copy this device saw rather than the true
       server state. It is best-effort by nature — the alternative, dropping the
       check whenever it cannot be perfect, would silently lose the other
       device's work in exactly the case the check exists for. */
    overwrite(id, circuit, seenUpdatedAt) {
      const err = requireReady();
      if (err) return Promise.reject(err);
      const body = buildBody(circuit);
      if (body instanceof Error) return Promise.reject(body);
      return driver.get(id).then(cur => {
        if (!cur) throw new Error('That project no longer exists.');
        const serverAt = toMillis(cur.data && cur.data.updatedAt);
        if (serverAt && seenUpdatedAt && serverAt > seenUpdatedAt) {
          const conflict = new Error('This project was changed on another device.');
          conflict.code = 'conflict';
          conflict.serverUpdatedAt = serverAt;
          throw conflict;
        }
        return withTimeout(driver.update(id, {
          circuit: body,
          schemaVersion: (typeof SAVE_FORMAT_VERSION === 'number') ? SAVE_FORMAT_VERSION : 1,
          updatedAt: driver.stamp()
        })).then(r => ({ id: id, queued: !!r.queued }));
      });
    },

    /* Overwrite regardless of a conflict — only reachable after the user has
       been told what they are discarding. */
    forceOverwrite(id, circuit) {
      return api.overwrite(id, circuit, null);
    },

    rename(id, name) {
      const err = requireReady();
      if (err) return Promise.reject(err);
      const clean = cleanName(name);
      if (!clean) return Promise.reject(new Error('A project needs a name.'));
      return withTimeout(driver.update(id, { name: clean, updatedAt: driver.stamp() }))
        .then(r => ({ id: id, name: clean, queued: !!r.queued }));
    },

    remove(id) {
      const err = requireReady();
      if (err) return Promise.reject(err);
      return withTimeout(driver.remove(id)).then(r => ({ id: id, queued: !!r.queued }));
    },

    /* Test seam. Passing null restores the real Firestore driver. Also forces a
       status so the suite can drive signed-out / error / ready states without
       an account. */
    __setDriver(d, forcedStatus, forcedUid) {
      driver = d || firestoreDriver;
      if (forcedStatus !== undefined) {
        uid = (forcedUid !== undefined) ? forcedUid : uid;
        setStatus(forcedStatus);
      }
    },

    /* Also a test seam: the offline-queue path is defined by a timeout, and a
       suite cannot wait eight seconds to observe it. */
    __setWriteTimeout(ms) {
      writeTimeout = (typeof ms === 'number' && ms > 0) ? ms : 8000;
    }
  };

  /* Strips the preview and refuses anything that would bounce off Firestore's
     document ceiling with an error the user cannot act on. The thumbnail is
     dropped here, at the boundary, rather than trusted to have been left out
     upstream — this is the guarantee that no base64 image reaches the cloud. */
  function buildBody(circuit) {
    if (!circuit || typeof circuit !== 'object') return new Error('Nothing to save.');
    const body = stripUndefined(circuit);
    delete body.thumbnail;
    const size = payloadSize(body);
    if (size > MAX_DOC_BYTES) {
      return new Error(
        'This project is too large to sync (' + Math.round(size / 1024) + ' KB). ' +
        'Export it to a file instead.');
    }
    return body;
  }

  /* ── Boot ────────────────────────────────────────────────────────────────
     Driven entirely by the auth bridge. Nothing connects until an account is
     admitted, and signing out tears the connection's identity down so the next
     account cannot read through it. */

  function connect(nextUid) {
    uid = nextUid;
    setStatus('connecting');
    if (!sdkLoad) {
      sdkLoad = loadScript(SDK_BASE + 'firebase-firestore-compat.js').then(() => {
        db = firebase.firestore();
        /* Offline persistence is what makes a dropped network a pause rather
           than a failure: reads come from cache and writes queue. It has to be
           enabled before any other Firestore call, and it legitimately fails
           when several tabs are open or the browser forbids storage — that is
           not fatal, it just means no offline support this session. */
        return db.enablePersistence({ synchronizeTabs: true })
          .catch(e => { console.warn('[cloud] offline persistence unavailable:', e && e.code); });
      });
    }
    sdkLoad.then(() => {
      /* The account may have changed or gone while the SDK was in flight. */
      if (uid !== nextUid) return;
      setStatus('ready');
    }).catch(e => {
      console.warn('[cloud]', e);
      sdkLoad = null;          // a blocked CDN may succeed on a later attempt
      if (uid === nextUid) setStatus('error', e);
    });
  }

  function disconnect() {
    uid = null;
    setStatus('signed-out');
  }

  document.addEventListener('tb-auth-change', () => {
    const u = window.TBAuthUser;
    if (u && u.uid) {
      if (u.uid !== uid || status === 'signed-out') connect(u.uid);
    } else {
      disconnect();
    }
  });

  /* A subscriber that parsed after the gate had already admitted somebody. */
  if (window.TBAuthUser && window.TBAuthUser.uid) connect(window.TBAuthUser.uid);

  window.TBCloud = api;
})();
