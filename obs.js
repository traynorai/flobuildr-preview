/**
 * Minimal observability beacon for the static marketing site. Lives outside
 * any bundler so each page can include it with a single <script> tag. Mirrors
 * the browser SDK's enqueue + flush behavior but without the React bits.
 *
 * API base: optional <meta name="flobuildr-telemetry-base" content="https://...">
 * (no trailing slash). Otherwise hostname heuristics: localhost → local API,
 * everything else → production. There is no dev.api.flobuildr.com.
 *
 * Public API: window.flobuildrObs.track(eventKind, props)
 *   — CTA clicks + signup funnel steps (form_start, submit, success, error).
 */
(function () {
  try {
    var SESSION_KEY = 'obs.sessionId';

    function resolveApiBase() {
      var loc = typeof location !== 'undefined' ? location : {};
      var protocol = loc.protocol || 'http:';
      var host = (loc.hostname || '').toLowerCase();
      try {
        var m = typeof document !== 'undefined' && document.querySelector('meta[name="flobuildr-telemetry-base"]');
        var c = m && m.getAttribute('content');
        if (c && String(c).trim()) {
          return String(c).trim().replace(/\/$/, '');
        }
      } catch (_) { /* ignore */ }
      var localHost =
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '[::1]' ||
        host === '::1';
      if (localHost || protocol === 'http:') return 'http://localhost:3009';
      return 'https://api.flobuildr.com';
    }

    var apiBase = resolveApiBase();

    var sessionId;
    try {
      sessionId = sessionStorage.getItem(SESSION_KEY);
      if (!sessionId) {
        sessionId = (typeof crypto !== 'undefined' && crypto.randomUUID && crypto.randomUUID()) ||
          ('s-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10));
        sessionStorage.setItem(SESSION_KEY, sessionId);
      }
    } catch (_) {
      sessionId = 's-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    }
    if (!sessionId) {
      sessionId = 's-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    }

    var buffer = [];
    var flushTimer = null;
    var earlyFlushTimer = null;
    var FLUSH_MS = 5000;
    var EARLY_FLUSH_MS = 400;

    function send(sync) {
      if (!buffer.length) return;
      var body = JSON.stringify({
        app: 'marketing',
        release: 'static',
        sessionId: sessionId,
        userId: null,
        companyId: null,
        events: buffer.splice(0, buffer.length)
      });
      var url = apiBase + '/api/_telemetry/events';
      try {
        if (sync && navigator.sendBeacon) {
          navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
        } else {
          fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-obs-session-id': sessionId,
              'x-obs-app': 'marketing',
              'x-obs-release': 'static'
            },
            body: body,
            keepalive: true,
            credentials: 'omit'
          }).catch(function () {});
        }
      } catch (_) { /* ignore */ }
    }

    function scheduleFlush() {
      if (flushTimer) return;
      flushTimer = setTimeout(function () {
        flushTimer = null;
        send(false);
      }, FLUSH_MS);
    }

    function scheduleEarlyFlushOnce() {
      if (earlyFlushTimer) return;
      earlyFlushTimer = setTimeout(function () {
        earlyFlushTimer = null;
        send(false);
      }, EARLY_FLUSH_MS);
    }

    function enqueue(evt) {
      buffer.push(Object.assign({ ts: new Date().toISOString() }, evt));
      if (buffer.length >= 20) {
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        if (earlyFlushTimer) {
          clearTimeout(earlyFlushTimer);
          earlyFlushTimer = null;
        }
        send(false);
      } else {
        scheduleFlush();
        scheduleEarlyFlushOnce();
      }
    }

    function route() {
      try { return location.pathname + location.search; } catch (_) { return null; }
    }

    function track(eventKind, props) {
      try {
        var p = props && typeof props === 'object' ? props : {};
        enqueue({
          kind: 'rum',
          eventKind: String(eventKind || 'custom'),
          route: p.route || route(),
          referrer: document.referrer || null,
          name: p.name || null,
          href: p.href || null,
          meta: p.meta || null
        });
      } catch (_) { /* never break the page */ }
    }

    enqueue({
      kind: 'rum',
      eventKind: 'pageview',
      route: route(),
      referrer: document.referrer || null
    });

    // Funnel: landing on /start
    try {
      if (/^\/start\/?$/.test(location.pathname || '')) {
        track('signup_view');
      }
    } catch (_) { /* ignore */ }

    // CTA click capture (primary marketing CTAs)
    document.addEventListener('click', function (e) {
      try {
        var el = e.target && e.target.closest
          ? e.target.closest('a.btn, a.nav-cta, button.btn, [data-obs-cta]')
          : null;
        if (!el) return;
        var label = (el.getAttribute('data-obs-cta')
          || el.textContent
          || '').replace(/\s+/g, ' ').trim().slice(0, 80);
        track('cta_click', {
          name: label,
          href: el.getAttribute('href') || null,
          meta: { id: el.id || null }
        });
      } catch (_) { /* ignore */ }
    }, true);

    window.addEventListener('error', function (e) {
      enqueue({
        kind: 'error',
        level: 'error',
        errorName: (e.error && e.error.name) || 'Error',
        message: e.message || 'window.onerror',
        stack: (e.error && e.error.stack) || null,
        route: route()
      });
    });

    window.addEventListener('unhandledrejection', function (e) {
      var r = e.reason || {};
      enqueue({
        kind: 'error',
        level: 'error',
        errorName: r.name || 'UnhandledRejection',
        message: r.message || String(r || 'unhandled rejection'),
        stack: r.stack || null,
        route: route()
      });
    });

    var onHide = function () {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      if (earlyFlushTimer) {
        clearTimeout(earlyFlushTimer);
        earlyFlushTimer = null;
      }
      send(true);
    };
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onHide);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') onHide();
    });

    window.flobuildrObs = {
      track: track,
      flush: function () { send(true); },
      apiBase: apiBase
    };
  } catch (_) { /* observability must never break the page */ }
})();
