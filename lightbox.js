/**
 * FloBuildr lightbox.
 *
 * The product screenshots are dense, detail-rich screens. They sit at a modest
 * size in the page so the layout stays readable, and open at full resolution on
 * click so the detail actually pays off.
 *
 * Scoped to img.zoomable, which is only ever a product screenshot. Photos, the
 * logo, the MCA mark, and the brand specimens on the branding page are never
 * given that class, so they are never zoomable.
 *
 * Progressive enhancement: the images are made focusable and keyboard operable
 * here rather than in the markup, so with JS off nothing claims to be a control.
 */
(function () {
  'use strict';

  var overlay = null, stage = null, shot = null, closeBtn = null;
  var lastTrigger = null;
  var reduceMotion = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  function focusable() {
    return overlay.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])');
  }

  function onKeydown(e) {
    if (!overlay || overlay.hidden) return;
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      closeOverlay();
      return;
    }
    if (e.key !== 'Tab') return;
    var items = focusable();
    if (!items.length) { e.preventDefault(); return; }
    var first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    } else if (!overlay.contains(document.activeElement)) {
      e.preventDefault(); first.focus();
    }
  }

  function lockScroll() {
    var bar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (bar > 0) document.body.style.paddingRight = bar + 'px';
  }

  function unlockScroll() {
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  }

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'lb-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Enlarged screenshot');
    overlay.hidden = true;

    stage = document.createElement('div');
    stage.className = 'lb-stage';

    shot = document.createElement('img');
    shot.className = 'lb-img';
    shot.alt = '';

    closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'lb-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = '&times;';

    stage.appendChild(shot);
    overlay.appendChild(stage);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);

    // Backdrop closes. A click on the image itself does not.
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay || e.target === stage) closeOverlay();
    });
    closeBtn.addEventListener('click', closeOverlay);
    document.addEventListener('keydown', onKeydown, true);
  }

  function openOverlay(trigger) {
    if (!overlay) build();
    lastTrigger = trigger;
    // currentSrc is the resource the browser already fetched, webp where one
    // exists, and it is the same full resolution as the png.
    shot.src = trigger.currentSrc || trigger.src;
    shot.alt = trigger.getAttribute('data-lb-alt') || trigger.alt || '';
    overlay.hidden = false;
    lockScroll();
    if (!reduceMotion) void overlay.offsetWidth; // reflow so the fade runs
    overlay.classList.add('is-open');
    closeBtn.focus();
  }

  function closeOverlay() {
    if (!overlay || overlay.hidden) return;
    overlay.classList.remove('is-open');
    var finish = function () {
      overlay.hidden = true;
      shot.removeAttribute('src');
      unlockScroll();
      if (lastTrigger) { lastTrigger.focus(); lastTrigger = null; }
    };
    if (reduceMotion) finish();
    else window.setTimeout(finish, 160);
  }

  function init() {
    var shots = document.querySelectorAll('img.zoomable');
    if (!shots.length) return;
    build();
    Array.prototype.forEach.call(shots, function (el) {
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'button');
      el.setAttribute('data-lb-alt', el.alt || '');
      el.setAttribute('aria-label', 'Enlarge screenshot' + (el.alt ? ': ' + el.alt : ''));
      el.addEventListener('click', function () { openOverlay(el); });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          openOverlay(el);
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
