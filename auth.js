/* ── Google sign-in gate ──────────────────────────────────────────────────
   Classic script, loaded last. Nothing here touches the simulator's state;
   it only covers the page until Firebase reports a signed-in user.

   The Firebase SDK is fetched at runtime instead of through <script> tags in
   index.html on purpose. The regression harness loads index.html in a frame,
   and a CDN request from inside that frame would put the test suite on the
   network — slow when it works, and a false failure when it doesn't.

   This is a product gate, not a security boundary. Every circuit the app
   stores lives in this browser's localStorage and the whole app is static
   files served from GitHub Pages, so there is nothing behind the gate that a
   determined visitor could not already read from view-source. Anything that
   genuinely must be protected needs a server, not this file.
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

  const SDK_BASE = 'https://www.gstatic.com/firebasejs/10.14.1/';

  const gate      = document.getElementById('tb-auth');
  const signInBtn = document.getElementById('tb-auth-btn');
  const errorEl   = document.getElementById('tb-auth-error');
  const signOutBtn = document.getElementById('btn-signout');
  const accountEl  = document.getElementById('tb-account');

  if (!gate) return;

  /* The regression harness frames the app and marks the frame URL. Both
     conditions are required: a page framed without the marker still gets the
     gate, and the marker alone does nothing at the top level. */
  const isTestFrame = window.top !== window.self &&
                      /[?&]tbtest=1(?:&|$)/.test(location.search);
  if (isTestFrame) {
    gate.remove();
    return;
  }

  /* An opaque overlay stops the eye but not a screen reader, so everything
     behind it is taken out of the accessibility tree and the tab order too.
     Walking body's children rather than naming ids keeps this working on both
     pages the gate covers — the app and the standalone manual, which share no
     wrapper markup. */
  function appRegions() {
    return Array.prototype.filter.call(document.body.children, el =>
      el !== gate &&
      el.id !== 'tb-loader' &&
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

  /* auth.js is not the last thing in the body on every page, so run the sweep
     again once the rest of the markup exists. Skipped if sign-in already
     resolved in the meantime. */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded',
      () => { if (gated) setAppReachable(false); }, { once: true });
  }

  function setState(state, message) {
    gate.dataset.state = state;
    errorEl.textContent = message || '';
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = false;                       // preserve app-then-auth order
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Could not load ' + src));
      document.head.appendChild(s);
    });
  }

  let auth = null;

  function signIn() {
    if (!auth) return;
    setState('working');
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    auth.signInWithPopup(provider).catch(err => {
      const code = err && err.code;

      /* Closing the chooser is a decision, not a failure — go quietly back to
         the button rather than accusing the user of an error. */
      if (code === 'auth/popup-closed-by-user' ||
          code === 'auth/cancelled-popup-request') {
        setState('signin');
        return;
      }

      /* No popup available (blocker, or an in-app webview that cannot open
         one). Full-page redirect is the supported way through. */
      if (code === 'auth/popup-blocked' ||
          code === 'auth/operation-not-supported-in-this-environment') {
        auth.signInWithRedirect(provider).catch(showAuthError);
        return;
      }

      showAuthError(err);
    });
  }

  function showAuthError(err) {
    const code = err && err.code;
    let msg = 'Sign-in failed. Please try again.';
    if (code === 'auth/network-request-failed') {
      msg = 'Could not reach Google. Check your connection and try again.';
    } else if (code === 'auth/unauthorized-domain') {
      msg = 'This address is not authorized for sign-in. Contact TradeBuilt support.';
    } else if (code === 'auth/user-disabled') {
      msg = 'This account has been disabled. Contact TradeBuilt support.';
    }
    setState('signin', msg);
    if (err) console.error('[auth]', err);
  }

  function onUser(user) {
    if (user) {
      gate.classList.add('tb-auth-done');
      setAppReachable(true);
      /* Kept out of the DOM once dismissed so a stray focus or tab stop can
         never land back inside it. */
      setTimeout(() => { gate.remove(); }, 400);

      if (accountEl) {
        accountEl.textContent = user.email || user.displayName || 'Signed in';
        accountEl.hidden = false;
      }
      if (signOutBtn) signOutBtn.hidden = false;
    } else {
      setState('signin');
      if (accountEl) accountEl.hidden = true;
      if (signOutBtn) signOutBtn.hidden = true;
    }
  }

  signInBtn.addEventListener('click', signIn);

  if (signOutBtn) {
    signOutBtn.addEventListener('click', () => {
      if (auth) auth.signOut().then(() => location.reload());
    });
  }

  loadScript(SDK_BASE + 'firebase-app-compat.js')
    .then(() => loadScript(SDK_BASE + 'firebase-auth-compat.js'))
    .then(() => {
      firebase.initializeApp(FIREBASE_CONFIG);
      auth = firebase.auth();
      /* Surfaces failures from the redirect fallback, which land on the next
         page load rather than in the signIn() promise. */
      auth.getRedirectResult().catch(showAuthError);
      auth.onAuthStateChanged(onUser, showAuthError);
    })
    .catch(err => {
      console.error('[auth]', err);
      setState('offline');
    });
})();
