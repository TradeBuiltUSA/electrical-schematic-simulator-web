/* ── Sign-in gate ─────────────────────────────────────────────────────────
   Classic script, loaded last. Covers the page until Firebase reports a usable
   account, then gets out of the way. Nothing here touches simulator state.

   Two structural choices worth knowing before editing:

   • The Firebase SDK is fetched at runtime rather than through <script> tags in
     the page. The regression harness loads index.html in a frame, and CDN tags
     there would put the whole test suite on the network.

   • The forms are built here instead of written into markup, because the gate
     covers two pages (the app and the standalone manual). Duplicated markup
     across both is how they would quietly fall out of step.

   This is a product gate, not a security boundary. The app is static files on
   GitHub Pages and every circuit lives in the visitor's own localStorage, so
   nothing behind the gate is unreachable from view-source. Sign-up is open:
   the gate records who is using the simulator, it does not restrict access.
   ──────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const FIREBASE_CONFIG = {
    apiKey:            'AIzaSyBywGZWtMWEtGbul_sO-Noq8njgiSwsWzU',
    authDomain:        'tradebuilt-simulator.firebaseapp.com',
    projectId:         'tradebuilt-simulator',
    storageBucket:     'tradebuilt-simulator.firebasestorage.app',
    messagingSenderId: '611215394190',
    appId:             '1:611215394190:web:52034325f758fc7501d0df'
  };

  const SDK_BASE     = 'https://www.gstatic.com/firebasejs/10.14.1/';
  const MIN_PASSWORD = 8;      // Firebase itself only enforces 6
  const RESEND_WAIT  = 45;     // seconds between verification emails
  const VERIFY_POLL  = 6000;   // how often the verify screen re-checks
  const BOOT_TIMEOUT = 15000;  // give up on "checking" and offer a way out

  const gate = document.getElementById('tb-auth');
  if (!gate) return;

  const signOutBtn = document.getElementById('btn-signout');
  const accountEl  = document.getElementById('tb-account');

  /* This script and the page that loads it are cached independently, so a
     visitor can hold a fresh copy of one and a stale copy of the other. Never
     assume the markup this version shipped with: build the render target when
     the page predates it, and clear out any older gate's children.

     This is not hypothetical — it is the bug that froze the gate on "Checking
     your sign-in…". A stale script dereferenced an element a newer page had
     dropped, threw before Firebase ever loaded, and left the overlay up with
     no way forward. The paired defence is the ?v= on the script and stylesheet
     URLs; bump it whenever this contract changes. */
  let body = document.getElementById('tb-auth-body');
  if (!body) {
    const card = gate.querySelector('#tb-auth-card') || gate;
    for (const stale of card.querySelectorAll(
        '#tb-auth-sub, #tb-auth-btn, #tb-auth-checking, #tb-auth-working, ' +
        '#tb-auth-offline, #tb-auth-error')) {
      stale.remove();
    }
    body = el('div', { id: 'tb-auth-body' });
    const legal = card.querySelector('#tb-auth-legal');
    if (legal) card.insertBefore(body, legal);
    else       card.appendChild(body);
  }

  /* The regression harness frames the app and marks the frame URL. Both
     conditions are required: a page framed without the marker still gets the
     gate, and the marker alone does nothing at the top level. */
  if (window.top !== window.self && /[?&]tbtest=1(?:&|$)/.test(location.search)) {
    gate.remove();
    return;
  }

  /* ── Hiding the page behind the gate ── */

  /* An opaque overlay stops the eye but not a screen reader, so everything
     behind it leaves the accessibility tree and the tab order. Walking body's
     children rather than naming ids keeps this working on both gated pages,
     which share no wrapper markup. inert also gives us a real focus trap for
     the dialog for free. */
  function appRegions() {
    return Array.prototype.filter.call(document.body.children, el =>
      el !== gate &&
      !/^(SCRIPT|STYLE|LINK|TEMPLATE)$/.test(el.tagName));
  }

  let gated = false;

  function setAppReachable(reachable) {
    gated = !reachable;
    document.documentElement.classList.toggle('tb-gated', gated);
    for (const el of appRegions()) {
      if (reachable) {
        el.removeAttribute('aria-hidden');
        el.removeAttribute('inert');
      } else {
        el.setAttribute('aria-hidden', 'true');
        el.setAttribute('inert', '');
      }
    }
  }
  setAppReachable(false);

  /* auth.js is not the last thing in the body on every page, so sweep again
     once the rest of the markup exists. */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded',
      () => { if (gated) setAppReachable(false); }, { once: true });
  }

  /* ── DOM helpers ── */

  function el(tag, props, kids) {
    const node = document.createElement(tag);
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class')      node.className = v;
        else if (k === 'text')  node.textContent = v;
        else if (k === 'on')    { for (const ev in v) node.addEventListener(ev, v[ev]); }
        else                    node.setAttribute(k, v === true ? '' : String(v));
      }
    }
    if (kids) {
      for (const kid of [].concat(kids)) if (kid) node.appendChild(kid);
    }
    return node;
  }

  const GOOGLE_MARK =
    '<svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">' +
    '<path fill="#4285F4" d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z"/>' +
    '<path fill="#34A853" d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.344 0-4.3282-1.5831-5.036-3.7104H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18z"/>' +
    '<path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1022-1.17.2822-1.71V4.9582H.9573A8.9965 8.9965 0 0 0 0 9c0 1.4523.3477 2.8268.9573 4.0418L3.964 10.71z"/>' +
    '<path fill="#EA4335" d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.6559 3.5795 9 3.5795z"/>' +
    '</svg>';

  const EYE_OPEN =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ' +
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M1.8 12S5.5 5 12 5s10.2 7 10.2 7-3.7 7-10.2 7S1.8 12 1.8 12z"/>' +
    '<circle cx="12" cy="12" r="3"/></svg>';

  const EYE_OFF =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ' +
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M10.6 6.2A7.9 7.9 0 0 1 12 6c6.5 0 10.2 6.6 10.2 6.6a17 17 0 0 1-3.2 3.9"/>' +
    '<path d="M6.4 7.6A17 17 0 0 0 1.8 12.6S5.5 19 12 19a8.6 8.6 0 0 0 4-1"/>' +
    '<path d="M9.9 10.4a3 3 0 0 0 4.2 4.2"/><line x1="3" y1="3" x2="21" y2="21"/></svg>';

  const CHECK_MARK =
    '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" ' +
    'stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M3 8.6l3.1 3.1L13 4.8"/></svg>';

  const DOT_MARK =
    '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">' +
    '<circle cx="8" cy="8" r="2.4" fill="currentColor"/></svg>';

  function icon(markup, cls) {
    const span = el('span', { class: cls, 'aria-hidden': 'true' });
    span.innerHTML = markup;                 // constant markup, no user data
    return span;
  }

  function note(text)      { return el('p', { class: 'tb-auth-note', text: text }); }
  function sub(text)       { return el('p', { class: 'tb-auth-sub',  text: text }); }
  function divider(text)   { return el('div', { class: 'tb-or' }, [el('span', { text: text || 'or' })]); }
  function primary(label)  { return el('button', { type: 'submit', class: 'tb-btn tb-btn-primary', text: label }); }

  function linkBtn(label, onClick) {
    return el('button', { type: 'button', class: 'tb-link', text: label, on: { click: onClick } });
  }

  function alertLine() {
    /* assertive: an authentication failure is the whole reason the user is
       still on this screen, so it should interrupt rather than queue. */
    return el('p', { class: 'tb-msg tb-msg-err', role: 'alert', 'aria-live': 'assertive' });
  }

  function statusLine() {
    return el('p', { class: 'tb-msg tb-msg-ok', 'aria-live': 'polite' });
  }

  function googleButton(label) {
    return el('button', {
      type: 'button', class: 'tb-btn tb-btn-google', on: { click: signInWithGoogle }
    }, [icon(GOOGLE_MARK, 'tb-btn-icon'), el('span', { text: label })]);
  }

  let fieldSeq = 0;

  function field(o) {
    const id    = 'tb-f-' + (++fieldSeq);
    const errId = id + '-err';

    const input = el('input', {
      id: id,
      type: o.type || 'text',
      name: o.name,
      autocomplete: o.autocomplete,
      inputmode: o.inputmode,
      autocapitalize: o.type === 'email' ? 'none' : null,
      spellcheck: o.type === 'email' ? 'false' : null,
      'aria-describedby': errId
    });

    const err  = el('p', { id: errId, class: 'tb-field-err' });
    const lbl  = el('label', { for: id, text: o.label });
    let control = input;
    let caps    = null;

    if (o.type === 'password') {
      const eye = el('button', {
        type: 'button', class: 'tb-eye',
        'aria-pressed': 'false', 'aria-label': 'Show password'
      }, [icon(EYE_OPEN, 'tb-eye-icon')]);

      eye.addEventListener('click', () => {
        const revealing = input.type === 'password';
        input.type = revealing ? 'text' : 'password';
        eye.setAttribute('aria-pressed', String(revealing));
        eye.setAttribute('aria-label', revealing ? 'Hide password' : 'Show password');
        eye.replaceChild(icon(revealing ? EYE_OFF : EYE_OPEN, 'tb-eye-icon'), eye.firstChild);
        input.focus();
      });

      control = el('div', { class: 'tb-input-wrap' }, [input, eye]);

      /* Caps Lock is the single most common reason a correct password is
         rejected, and the field masks the evidence. */
      caps = el('p', { class: 'tb-caps', hidden: true, text: 'Caps Lock is on' });
      const checkCaps = e => {
        if (typeof e.getModifierState === 'function') {
          caps.hidden = !e.getModifierState('CapsLock');
        }
      };
      input.addEventListener('keydown', checkCaps);
      input.addEventListener('keyup', checkCaps);
      input.addEventListener('blur', () => { caps.hidden = true; });
    }

    const f = {
      row:   el('div', { class: 'tb-field' }, [lbl, control, caps, err]),
      input: input,
      err:   err
    };
    input.addEventListener('input', () => setFieldError(f, ''));
    return f;
  }

  function setFieldError(f, msg) {
    f.err.textContent = msg || '';
    if (msg) f.input.setAttribute('aria-invalid', 'true');
    else     f.input.removeAttribute('aria-invalid');
  }

  function validEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  }

  /* ── Live password requirements ───────────────────────────────────────────
     One place defines what a password must contain: the checklist the visitor
     watches, the field error on submit, and the sign-up guard all read this
     table. Adding a rule here is the whole change.

     "Special character" deliberately excludes whitespace. A space satisfies
     "not a letter or a digit" while adding almost nothing, and a trailing one
     is invisible in a masked field — the kind of password that works once and
     never again.
     ──────────────────────────────────────────────────────────────────────── */
  const PASSWORD_RULES = [
    { label: 'At least ' + MIN_PASSWORD + ' characters',
      need:  'at least ' + MIN_PASSWORD + ' characters',
      test:  v => v.length >= MIN_PASSWORD },
    { label: 'One capital letter (A–Z)',
      need:  'one capital letter',
      test:  v => /[A-Z]/.test(v) },
    { label: 'One number (0–9)',
      need:  'one number',
      test:  v => /[0-9]/.test(v) },
    { label: 'One special character (! ? # $ …)',
      need:  'one special character',
      test:  v => /[^A-Za-z0-9\s]/.test(v) }
  ];

  function passwordMeetsRules(v) {
    return PASSWORD_RULES.every(r => r.test(v));
  }

  /* The checklist under the password field. Two behaviours are load-bearing:

     • It stays neutral until the visitor leaves the field or presses the
       submit button. Painting a half-typed password red on the second
       keystroke reads as scolding, and every password is invalid on its way
       to being valid.

     • The rules reach a screen reader through aria-describedby, not through a
       live region. Three rules re-announced on every keystroke is unusable
       noise; instead they are read once when the field takes focus, and a
       single polite line reports the one transition that matters. */
  function passwordChecklist(f) {
    const listId = 'tb-req-' + (++fieldSeq);

    const items = PASSWORD_RULES.map(rule => {
      const mark = icon(DOT_MARK, 'tb-req-mark');
      return {
        rule: rule,
        mark: mark,
        met:  false,
        li:   el('li', { class: 'tb-req', 'data-state': 'pending' },
                [mark, el('span', { text: rule.label })])
      };
    });

    const list = el('ul', { id: listId, class: 'tb-reqs' }, items.map(i => i.li));
    const live = el('p', { class: 'tb-sr-only', 'aria-live': 'polite' });

    /* Appended to whatever the field already points at, so the inline error
       keeps being announced too. */
    f.input.setAttribute('aria-describedby',
      (f.input.getAttribute('aria-describedby') || '') + ' ' + listId);

    let armed    = false;   // has the visitor finished a first attempt?
    let allMet   = false;
    let announced = null;

    function paint() {
      const v = f.input.value;
      allMet = true;
      for (const item of items) {
        const met = item.rule.test(v);
        if (met !== item.met) {
          item.met = met;
          item.mark.innerHTML = met ? CHECK_MARK : DOT_MARK;   // constant markup
        }
        item.li.dataset.state = met ? 'met' : (armed ? 'missing' : 'pending');
        if (!met) allMet = false;
      }
      /* Only on the transition — rewriting the same sentence makes some
         screen readers say it again. */
      const say = allMet && v ? 'Password meets all requirements.' : '';
      if (say !== announced) {
        announced = say;
        live.textContent = say;
      }
      return allMet;
    }

    function arm() {
      armed = true;
      paint();
    }

    f.input.addEventListener('input', paint);
    /* An untouched field is not a failed one. */
    f.input.addEventListener('blur', () => { if (f.input.value) arm(); });

    f.row.insertBefore(list, f.err);
    f.row.appendChild(live);

    return {
      arm: arm,
      ok:  () => allMet,
      /* What to put in the field error when submit is refused. */
      missing: () => {
        const gap = PASSWORD_RULES.filter(r => !r.test(f.input.value));
        /* Each rule carries its own sentence form: lowercasing the label
           would turn "(A–Z)" into "(a–z)". */
        return gap.length === 1
          ? 'Password still needs ' + gap[0].need + '.'
          : 'Password does not meet the requirements below.';
      }
    };
  }

  /* Live "do these two match?" line under the confirm field. Muted while the
     visitor is still typing the second copy, red once they have moved on. */
  function matchIndicator(pass, conf) {
    const line = el('p', { class: 'tb-match', 'aria-live': 'polite' });
    let armed = false;
    let same  = false;

    function paint() {
      const b = conf.input.value;
      same = !!b && pass.input.value === b;
      let text = '', state = '';
      if (b) {
        text  = same ? 'Passwords match' : 'Passwords do not match';
        state = same ? 'ok' : (armed ? 'bad' : 'pending');
      }
      if (line.textContent !== text) line.textContent = text;
      line.dataset.state = state;
      return same;
    }

    function arm() {
      armed = true;
      paint();
    }

    pass.input.addEventListener('input', paint);
    conf.input.addEventListener('input', paint);
    conf.input.addEventListener('blur', () => { if (conf.input.value) arm(); });

    conf.row.insertBefore(line, conf.err);
    return { arm: arm, ok: () => same };
  }

  /* Required-field checking that reports as the visitor moves through the
     form rather than saving everything up for the submit button. */
  function validateOnBlur(f, check) {
    f.input.addEventListener('blur', () => {
      const v = f.input.value.trim();
      if (!v) return;                       // empty is for submit to complain about
      setFieldError(f, check(v) || '');
    });
  }

  /* ── Busy state ── */

  function setBusy(form, on, label) {
    const btn = form.querySelector('.tb-btn-primary');
    for (const control of form.querySelectorAll('input, button')) {
      control.disabled = on;
    }
    if (btn) {
      if (on) {
        if (!btn.dataset.label) btn.dataset.label = btn.textContent;
        btn.textContent = label || btn.dataset.label;
        btn.classList.add('is-busy');
      } else {
        if (btn.dataset.label) btn.textContent = btn.dataset.label;
        btn.classList.remove('is-busy');
      }
    }
    /* The Google button lives outside the form element. */
    const g = body.querySelector('.tb-btn-google');
    if (g) g.disabled = on;
  }

  /* ── Turning Firebase error codes into something readable ── */

  function messageFor(err) {
    switch (err && err.code) {
      case 'auth/invalid-email':
        return 'That does not look like a valid email address.';
      case 'auth/missing-password':
        return 'Enter your password.';
      /* Deliberately identical for all three: saying which half was wrong
         tells a stranger whether an account exists. */
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
      case 'auth/invalid-login-credentials':
        return 'Email or password is incorrect.';
      case 'auth/email-already-in-use':
        return 'An account already exists for that email. Try signing in instead.';
      case 'auth/weak-password':
        return 'Choose a password at least ' + MIN_PASSWORD + ' characters long.';
      case 'auth/too-many-requests':
        return 'Too many attempts from this device. Wait a few minutes and try again.';
      case 'auth/network-request-failed':
        return 'Could not reach the sign-in service. Check your connection and try again.';
      case 'auth/user-disabled':
        return 'This account has been disabled. Contact TradeBuilt support.';
      case 'auth/unauthorized-domain':
        return 'This address is not authorized for sign-in. Contact TradeBuilt support.';
      case 'auth/account-exists-with-different-credential':
        return 'You already have an account with that email. Sign in with your password instead.';
      case 'auth/operation-not-allowed':
        return 'That sign-in method is turned off for this project.';
      case 'auth/requires-recent-login':
        return 'Please sign in again to continue.';
      default:
        return 'Something went wrong. Please try again.';
    }
  }

  /* ── View switching ── */

  let auth   = null;
  let timers = [];

  /* Views own intervals (the verify screen polls, and its resend button counts
     down). Anything a view starts goes through track() so leaving the view
     stops it — a detached node's timer would otherwise keep firing. */
  function track(id) { timers.push(id); return id; }
  function clearTimers() {
    for (const t of timers) clearInterval(t);
    timers = [];
  }

  function render(nodes, state, focusEl) {
    gate.dataset.state = state;
    body.textContent = '';
    for (const n of [].concat(nodes)) if (n) body.appendChild(n);
    if (focusEl) {
      /* After a view swap, not on first paint — grabbing focus while the
         splash is still fading is disorienting. */
      requestAnimationFrame(() => { try { focusEl.focus(); } catch (e) {} });
    }
  }

  let firstPaint = true;

  function show(view, ctx) {
    /* Before building, not after: the view being built may start its own
       timers, and clearing afterwards would kill them on arrival. */
    clearTimers();
    const built = view(ctx || {});
    render(built.nodes, built.state, firstPaint ? null : built.focus);
    firstPaint = false;
  }

  /* ── Sign in ── */

  function signInView(ctx) {
    const email = field({ name: 'email', label: 'Email', type: 'email',
                          autocomplete: 'username', inputmode: 'email' });
    const pass  = field({ name: 'password', label: 'Password', type: 'password',
                          autocomplete: 'current-password' });
    if (ctx.email) email.input.value = ctx.email;

    const remember = el('input', { type: 'checkbox', id: 'tb-remember', checked: true });
    const msg  = alertLine();
    const ok   = statusLine();
    if (ctx.notice) ok.textContent = ctx.notice;

    const form = el('form', { class: 'tb-form', novalidate: true }, [
      email.row,
      pass.row,
      el('div', { class: 'tb-row-between' }, [
        el('label', { class: 'tb-check', for: 'tb-remember' },
          [remember, el('span', { text: 'Keep me signed in' })]),
        linkBtn('Forgot password?', () => show(resetView, { email: email.input.value.trim() }))
      ]),
      ok,
      msg,
      primary('Sign in')
    ]);

    form.addEventListener('submit', e => {
      e.preventDefault();
      msg.textContent = '';
      ok.textContent = '';
      const address  = email.input.value.trim();
      const password = pass.input.value;

      if (!validEmail(address)) {
        setFieldError(email, 'Enter a valid email address.');
        email.input.focus();
        return;
      }
      if (!password) {
        setFieldError(pass, 'Enter your password.');
        pass.input.focus();
        return;
      }

      setBusy(form, true, 'Signing in…');
      /* Persistence has to be set before the sign-in call, not after. */
      const mode = remember.checked
        ? firebase.auth.Auth.Persistence.LOCAL
        : firebase.auth.Auth.Persistence.SESSION;

      auth.setPersistence(mode)
        .then(() => auth.signInWithEmailAndPassword(address, password))
        .catch(err => {
          setBusy(form, false);
          msg.textContent = messageFor(err);
          pass.input.value = '';
          pass.input.focus();
          console.warn('[auth]', err && err.code);
        });
    });

    return {
      state: 'signin',
      focus: email.input,
      nodes: [
        sub('Sign in to build, energize, and troubleshoot circuits.'),
        googleButton('Continue with Google'),
        divider(),
        form,
        el('p', { class: 'tb-foot' }, [
          el('span', { text: 'New here? ' }),
          linkBtn('Create an account', () => show(signUpView, { email: email.input.value.trim() }))
        ])
      ]
    };
  }

  /* ── Create account ── */

  function signUpView(ctx) {
    /* Two name fields rather than one "Full name". A single box has to guess
       where the given name ends, and it guesses wrong for anyone whose name
       does not fit "one word, then one word". */
    const first = field({ name: 'firstName', label: 'First name',
                          autocomplete: 'given-name' });
    const last  = field({ name: 'lastName', label: 'Last name',
                          autocomplete: 'family-name' });
    const email = field({ name: 'email', label: 'Email', type: 'email',
                          autocomplete: 'username', inputmode: 'email' });
    const pass  = field({ name: 'password', label: 'Password', type: 'password',
                          autocomplete: 'new-password' });
    const conf  = field({ name: 'confirm', label: 'Confirm password', type: 'password',
                          autocomplete: 'new-password' });
    if (ctx.email) email.input.value = ctx.email;

    const rules = passwordChecklist(pass);
    const match = matchIndicator(pass, conf);

    validateOnBlur(email, v =>
      validEmail(v) ? '' : 'Enter a valid email address.');

    const msg = alertLine();

    const form = el('form', { class: 'tb-form', novalidate: true }, [
      el('div', { class: 'tb-field-pair' }, [first.row, last.row]),
      email.row,
      pass.row,
      conf.row,
      msg,
      primary('Create account')
    ]);

    form.addEventListener('submit', e => {
      e.preventDefault();
      msg.textContent = '';
      const firstName = first.input.value.trim();
      const lastName  = last.input.value.trim();
      const address   = email.input.value.trim();
      const password  = pass.input.value;

      /* Submit is also what arms the two live indicators: from here on an
         unmet rule reads as an error rather than as a rule not reached yet. */
      rules.arm();
      match.arm();

      if (!firstName) {
        setFieldError(first, 'Enter your first name.');
        first.input.focus();
        return;
      }
      if (!lastName) {
        setFieldError(last, 'Enter your last name.');
        last.input.focus();
        return;
      }
      if (!address) {
        setFieldError(email, 'Enter your email address.');
        email.input.focus();
        return;
      }
      if (!validEmail(address)) {
        setFieldError(email, 'Enter a valid email address.');
        email.input.focus();
        return;
      }
      if (!passwordMeetsRules(password)) {
        setFieldError(pass, rules.missing());
        pass.input.focus();
        return;
      }
      if (conf.input.value !== password) {
        setFieldError(conf, 'Both passwords must match.');
        conf.input.focus();
        return;
      }

      setBusy(form, true, 'Creating account…');
      auth.createUserWithEmailAndPassword(address, password)
        .then(cred => {
          const user = cred.user;
          /* onAuthStateChanged has already moved us to the verify screen by
             now; these just finish filling the account in. */
          return Promise.all([
            user.updateProfile({ displayName: firstName + ' ' + lastName }),
            user.sendEmailVerification()
          ]).catch(err => { console.warn('[auth] post-signup', err); });
        })
        .catch(err => {
          setBusy(form, false);
          msg.textContent = messageFor(err);
          if (err && err.code === 'auth/email-already-in-use') email.input.focus();
          console.warn('[auth]', err && err.code);
        });
    });

    return {
      state: 'signup',
      focus: first.input,
      nodes: [
        sub('Create an account to save circuits and pick up where you left off.'),
        googleButton('Sign up with Google'),
        divider(),
        form,
        el('p', { class: 'tb-foot' }, [
          el('span', { text: 'Already have an account? ' }),
          linkBtn('Sign in', () => show(signInView, { email: email.input.value.trim() }))
        ])
      ]
    };
  }

  /* ── Forgot password ── */

  function resetView(ctx) {
    const email = field({ name: 'email', label: 'Email', type: 'email',
                          autocomplete: 'username', inputmode: 'email' });
    if (ctx.email) email.input.value = ctx.email;

    const msg = alertLine();
    const ok  = statusLine();

    const form = el('form', { class: 'tb-form', novalidate: true }, [
      email.row, ok, msg, primary('Send reset link')
    ]);

    form.addEventListener('submit', e => {
      e.preventDefault();
      msg.textContent = '';
      ok.textContent = '';
      const address = email.input.value.trim();

      if (!validEmail(address)) {
        setFieldError(email, 'Enter a valid email address.');
        email.input.focus();
        return;
      }

      setBusy(form, true, 'Sending…');

      /* Same confirmation whether or not the address has an account: a
         different answer for each would let a stranger test emails against
         your user list. */
      const done = () => {
        setBusy(form, false);
        ok.textContent = 'If an account exists for ' + address +
                         ', a reset link is on its way. Check spam if it does not arrive.';
      };

      auth.sendPasswordResetEmail(address)
        .then(done)
        .catch(err => {
          if (err && err.code === 'auth/user-not-found') { done(); return; }
          setBusy(form, false);
          msg.textContent = messageFor(err);
          console.warn('[auth]', err && err.code);
        });
    });

    return {
      state: 'reset',
      focus: email.input,
      nodes: [
        sub('Enter your email and we will send you a link to set a new password.'),
        form,
        el('p', { class: 'tb-foot' }, [
          linkBtn('Back to sign in', () => show(signInView, { email: email.input.value.trim() }))
        ])
      ]
    };
  }

  /* ── Waiting on email verification ── */

  function verifyView(ctx) {
    const user = ctx.user;
    const msg  = alertLine();
    const ok   = statusLine();

    const resend = el('button', { type: 'button', class: 'tb-btn tb-btn-ghost', text: 'Resend email' });
    const cont   = el('button', { type: 'button', class: 'tb-btn tb-btn-primary', text: "I have verified — continue" });

    let cooldown = 0;
    let ticker   = null;


    function startCooldown() {
      cooldown = RESEND_WAIT;
      resend.disabled = true;
      const tick = () => {
        cooldown--;
        if (cooldown <= 0) {
          clearInterval(ticker);
          ticker = null;
          resend.disabled = false;
          resend.textContent = 'Resend email';
        } else {
          resend.textContent = 'Resend in ' + cooldown + 's';
        }
      };
      resend.textContent = 'Resend in ' + cooldown + 's';
      ticker = track(setInterval(tick, 1000));
    }

    resend.addEventListener('click', () => {
      msg.textContent = '';
      ok.textContent = '';
      const current = auth.currentUser;
      if (!current) return;
      startCooldown();
      current.sendEmailVerification()
        .then(() => { ok.textContent = 'Sent. Check your inbox, and your spam folder.'; })
        .catch(err => { msg.textContent = messageFor(err); console.warn('[auth]', err && err.code); });
    });

    function recheck(quiet) {
      const current = auth.currentUser;
      if (!current) return;
      current.reload().then(() => {
        const fresh = auth.currentUser;
        if (fresh && fresh.emailVerified) {
          admit(fresh);
        } else if (!quiet) {
          msg.textContent = 'Not verified yet. Open the link in the email, then try again.';
        }
      }).catch(err => {
        if (!quiet) msg.textContent = messageFor(err);
      });
    }

    cont.addEventListener('click', () => {
      msg.textContent = '';
      ok.textContent = '';
      recheck(false);
    });

    /* Verifying happens in another tab or on a phone, so nothing tells this
       page about it. Poll quietly so the common case needs no button press. */
    track(setInterval(() => recheck(true), VERIFY_POLL));

    return {
      state: 'verify',
      focus: cont,
      nodes: [
        sub('Almost there — confirm your email address.'),
        note('We sent a verification link to ' + (user.email || 'your address') +
             '. Open it, then come back here.'),
        ok,
        msg,
        cont,
        resend,
        el('p', { class: 'tb-foot' }, [
          linkBtn('Use a different account', () => auth.signOut())
        ])
      ]
    };
  }

  function offlineView() {
    const again = el('button', {
      type: 'button', class: 'tb-btn tb-btn-ghost', text: 'Reload',
      on: { click: () => location.reload() }
    });
    return {
      state: 'offline',
      focus: again,
      nodes: [note('Could not reach the sign-in service. Check your connection and try again.'), again]
    };
  }

  /* ── Google ── */

  function signInWithGoogle() {
    if (!auth) return;
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    const g = body.querySelector('.tb-btn-google');
    if (g) g.disabled = true;

    const revive = () => { if (g) g.disabled = false; };

    auth.signInWithPopup(provider).catch(err => {
      const code = err && err.code;

      /* Closing the chooser is a decision, not a failure. */
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        revive();
        return;
      }

      /* No popup available (blocker, or an in-app webview that cannot open
         one). A full-page redirect is the supported way through. */
      if (code === 'auth/popup-blocked' ||
          code === 'auth/operation-not-supported-in-this-environment') {
        auth.signInWithRedirect(provider).catch(e => { revive(); showTopLevelError(e); });
        return;
      }

      revive();
      showTopLevelError(err);
    });
  }

  function showTopLevelError(err) {
    console.warn('[auth]', err && err.code);
    const line = body.querySelector('.tb-msg-err');
    if (line) line.textContent = messageFor(err);
  }

  /* ── Admission ── */

  function admit(user) {
    clearTimers();
    gate.classList.add('tb-auth-done');
    setAppReachable(true);
    /* Taken out of the DOM once dismissed so no stray focus or tab stop can
       land back inside it. */
    setTimeout(() => { gate.remove(); }, 400);

    if (accountEl) {
      accountEl.textContent = user.displayName || user.email || 'Signed in';
      accountEl.hidden = false;
    }
    if (signOutBtn) signOutBtn.hidden = false;
  }

  /* Google vouches for its own addresses; only password accounts have an
     unverified state worth stopping for. */
  function needsVerification(user) {
    if (user.emailVerified) return false;
    return (user.providerData || []).some(p => p && p.providerId === 'password');
  }

  function onUser(user) {
    if (!user) {
      if (accountEl) accountEl.hidden = true;
      if (signOutBtn) signOutBtn.hidden = true;
      show(signInView, {});
      return;
    }
    if (needsVerification(user)) {
      show(verifyView, { user: user });
      return;
    }
    admit(user);
  }

  if (signOutBtn) {
    signOutBtn.addEventListener('click', () => {
      if (auth) auth.signOut().then(() => location.reload());
    });
  }

  /* ── Boot ── */

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

  /* Last line of defence. Whatever goes wrong — a throw, a blocked SDK, an
     onAuthStateChanged that never fires — the visitor gets a way forward
     rather than an overlay that spins for good. */
  setTimeout(() => {
    if (gate.isConnected && gate.dataset.state === 'checking') {
      console.warn('[auth] no auth state after ' + BOOT_TIMEOUT + 'ms');
      show(offlineView, {});
    }
  }, BOOT_TIMEOUT);

  loadScript(SDK_BASE + 'firebase-app-compat.js')
    .then(() => loadScript(SDK_BASE + 'firebase-auth-compat.js'))
    .then(() => {
      firebase.initializeApp(FIREBASE_CONFIG);
      auth = firebase.auth();
      /* Failures from the redirect fallback land on the next page load rather
         than in the signInWithGoogle promise. */
      auth.getRedirectResult().catch(err => {
        show(signInView, {});
        showTopLevelError(err);
      });
      auth.onAuthStateChanged(onUser, err => {
        show(signInView, {});
        showTopLevelError(err);
      });
    })
    .catch(err => {
      console.error('[auth]', err);
      show(offlineView, {});
    });
})();
