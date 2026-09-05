/**
 * FloBuildr screenshot viewer.
 *
 * The product screenshots are dense screens: table rows, line items, money
 * columns. Sitting in the page they are decoration, so clicking one opens it
 * here at full width and lets you zoom in far enough to actually read it.
 *
 * Sizing rule: an image never opens smaller than it appeared in the page, and
 * never narrower than the viewport. Tall screens therefore overflow vertically
 * and the stage scrolls, rather than being shrunk to fit the height.
 *
 * Scoped to img.zoomable, which is only ever a product screenshot. Photos, the
 * logo, the MCA mark, and the brand specimens never carry that class.
 *
 * Progressive enhancement: the triggers are made focusable and keyboard
 * operable here, not in the markup, so with JS off nothing claims to be a
 * control that does nothing.
 */
(function () {
  'use strict';

  var overlay, stage, shot, pct, btnIn, btnOut, btnReset, btnClose;
  var lastTrigger = null;
  var natural = 0, scale = 1, baseScale = 1, minScale = 1, maxScale = 3;
  var dragged = false;
  var reduceMotion = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  var STEP = 1.25;          // one wheel notch or button press
  var DRAG_SLOP = 5;        // px of movement before a click counts as a drag
  var MIN_TOP_SCALE = 3;    // always allow at least 300 percent of natural

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function render() {
    if (!isFinite(natural) || natural <= 0) return;
    shot.style.width = Math.round(natural * scale) + 'px';
    pct.textContent = Math.round(scale * 100) + '%';
    btnOut.disabled = scale <= minScale + 0.001;
    btnIn.disabled = scale >= maxScale - 0.001;
    shot.style.cursor = scale > minScale + 0.001 ? 'grab' : 'default';
  }

  /* Change scale while keeping the point under (ax, ay) where it is. */
  function zoomTo(next, ax, ay) {
    next = clamp(next, minScale, maxScale);
    if (Math.abs(next - scale) < 0.0005) return;
    var r = stage.getBoundingClientRect();
    if (ax === undefined) { ax = r.left + r.width / 2; ay = r.top + r.height / 2; }
    var px = ax - r.left, py = ay - r.top;
    var cx = (stage.scrollLeft + px) / scale;
    var cy = (stage.scrollTop + py) / scale;
    scale = next;
    render();
    stage.scrollLeft = cx * scale - px;
    stage.scrollTop = cy * scale - py;
  }

  function fitWidth() {
    if (!isFinite(natural) || natural <= 0) return;
    // Open at the width of the stage, or the size it had in the page, whichever
    // is larger. Never smaller than it already was.
    var stageW = stage.clientWidth || window.innerWidth;
    var inPage = lastTrigger ? lastTrigger.getBoundingClientRect().width : 0;
    baseScale = Math.max(stageW / natural, inPage / natural);
    minScale = baseScale;
    maxScale = Math.max(MIN_TOP_SCALE, baseScale * 1.5);
    scale = baseScale;
    render();
    stage.scrollTop = 0;
    stage.scrollLeft = Math.max(0, (stage.scrollWidth - stage.clientWidth) / 2);
  }

  function focusable() {
    return overlay.querySelectorAll('button:not([disabled]), [tabindex]:not([tabindex="-1"])');
  }

  function onKeydown(e) {
    if (!overlay || overlay.hidden) return;
    var k = e.key;
    if (k === 'Escape' || k === 'Esc') { e.preventDefault(); closeOverlay(); return; }
    if (k === '+' || k === '=') { e.preventDefault(); zoomTo(scale * STEP); return; }
    if (k === '-' || k === '_') { e.preventDefault(); zoomTo(scale / STEP); return; }
    if (k === '0') { e.preventDefault(); fitWidth(); return; }
    if (k !== 'Tab') return;
    var items = focusable();
    if (!items.length) { e.preventDefault(); return; }
    var first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (!overlay.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
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

  function btn(cls, label, text) {
    var el = document.createElement('button');
    el.type = 'button';
    el.className = 'lb-btn ' + cls;
    el.setAttribute('aria-label', label);
    el.innerHTML = text;
    return el;
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
    stage.setAttribute('tabindex', '0');
    stage.setAttribute('aria-label', 'Screenshot, scroll or drag to pan, plus and minus to zoom');

    shot = document.createElement('img');
    shot.className = 'lb-img';
    shot.alt = '';
    shot.draggable = false;

    var bar = document.createElement('div');
    bar.className = 'lb-bar';
    btnOut = btn('lb-out', 'Zoom out', '&minus;');
    pct = document.createElement('span');
    pct.className = 'lb-pct';
    pct.setAttribute('aria-live', 'polite');
    btnIn = btn('lb-in', 'Zoom in', '+');
    btnReset = btn('lb-reset', 'Reset zoom', 'Reset');
    btnClose = btn('lb-close', 'Close', '&times;');
    bar.appendChild(btnOut); bar.appendChild(pct); bar.appendChild(btnIn);
    bar.appendChild(btnReset); bar.appendChild(btnClose);

    stage.appendChild(shot);
    overlay.appendChild(stage);
    overlay.appendChild(bar);
    document.body.appendChild(overlay);

    btnIn.addEventListener('click', function () { zoomTo(scale * STEP); });
    btnOut.addEventListener('click', function () { zoomTo(scale / STEP); });
    btnReset.addEventListener('click', fitWidth);
    btnClose.addEventListener('click', closeOverlay);

    // Backdrop closes, but never as the tail end of a pan.
    overlay.addEventListener('click', function (e) {
      if (dragged) { dragged = false; return; }
      if (e.target === overlay || e.target === stage) closeOverlay();
    });

    stage.addEventListener('wheel', function (e) {
      e.preventDefault();
      zoomTo(scale * (e.deltaY < 0 ? STEP : 1 / STEP), e.clientX, e.clientY);
    }, { passive: false });

    // Mouse drag pans. Touch is left to the browser so native scrolling and
    // pinch zoom keep working on a phone.
    var panning = false, sx = 0, sy = 0, sl = 0, stp = 0, moved = 0;
    stage.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      panning = true; moved = 0;
      sx = e.clientX; sy = e.clientY;
      sl = stage.scrollLeft; stp = stage.scrollTop;
      shot.style.cursor = 'grabbing';
      stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointermove', function (e) {
      if (!panning) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      moved = Math.max(moved, Math.abs(dx), Math.abs(dy));
      stage.scrollLeft = sl - dx;
      stage.scrollTop = stp - dy;
    });
    function endPan(e) {
      if (!panning) return;
      panning = false;
      dragged = moved > DRAG_SLOP;
      render();
      try { stage.releasePointerCapture(e.pointerId); } catch (err) { /* already gone */ }
    }
    stage.addEventListener('pointerup', endPan);
    stage.addEventListener('pointercancel', endPan);

    document.addEventListener('keydown', onKeydown, true);
    window.addEventListener('resize', function () {
      if (overlay && !overlay.hidden) fitWidth();
    });
  }

  function openOverlay(trigger) {
    if (!overlay) build();
    lastTrigger = trigger;
    dragged = false;
    // currentSrc is what the browser already fetched, webp where one exists,
    // and it is the same pixel dimensions as the png.
    natural = 0;
    shot.removeAttribute('src');
    shot.alt = trigger.getAttribute('data-lb-alt') || '';
    overlay.hidden = false;
    lockScroll();
    if (!reduceMotion) void overlay.offsetWidth;
    overlay.classList.add('is-open');
    // The trigger may be a lazy image that has not decoded, so its naturalWidth
    // is not trustworthy. Size from the overlay image once it reports its own.
    shot.onload = function () {
      natural = shot.naturalWidth || 0;
      fitWidth();
    };
    shot.src = trigger.currentSrc || trigger.src;
    if (shot.complete && shot.naturalWidth) {
      natural = shot.naturalWidth;
      fitWidth();
    }
    btnClose.focus();
  }

  function closeOverlay() {
    if (!overlay || overlay.hidden) return;
    overlay.classList.remove('is-open');
    var finish = function () {
      overlay.hidden = true;
      shot.onload = null;
      shot.removeAttribute('src');
      shot.style.width = '';
      natural = 0;
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
