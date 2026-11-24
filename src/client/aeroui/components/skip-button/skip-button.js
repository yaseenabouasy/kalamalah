/* Skip button — HTML port of SwiftUI PlayerButton for skip next/previous.
 *
 * Same press semantics as aero-player (PressGesture.swift):
 *   - zero-distance drag: onPressed fires once on touch-down
 *   - a free-running `interval` timer calls onPressing(elapsed) while held
 *   - onEnded fires on release (not on cancel)
 *   - dual scale (0.85 whole / 0.9 label) while held; on release the scale
 *     snaps back at once, the circle fades 0.2s later
 *   - label swaps animate with a symbol-replace transition
 *   - Disabled = no-op
 *
 * Markup (native <button> recommended — keyboard + disabled come free):
 *
 *   <button class="aero-skip-btn" data-direction="forward" aria-label="Next">
 *     <svg …>…</svg>
 *   </button>
 *
 * Attributes:
 *   data-direction      "forward" | "backward" (default: forward)
 *   data-interval       onPressing repeat seconds (default 0.1)
 *   data-haptics        opt-in tick on press (any pattern from core/haptics.js)
 *   disabled / data-disabled
 *
 * Events (all bubble):
 *   pressstart          onPressed — once per touch-down / key-down
 *   pressing            onPressing — detail.elapsed (seconds held, float)
 *   pressend            onEnded — detail.elapsed at release
 *
 * Replace the label content (e.g. forward ⇄ backward) and the swap animates.
 */

import { animate } from '../../core/motion.js';
import { PATTERNS } from '../../core/haptics.js';

const HIDE_DELAY_MS = 200;
const ECHO_GUARD_MS = 600;
const PRESS_SPRING = { duration: 0.9, bounce: 0.6 };
const MIN_HOLD_MS = 80;

function isDisabled(el) {
  return el.disabled === true || el.hasAttribute('data-disabled');
}

function intervalSec(el) {
  const v = Number(el.dataset.interval);
  return Number.isNaN(v) || v <= 0 ? 0.1 : v;
}

function ensureLabel(el) {
  let label = el.querySelector(':scope > .aero-skip-btn-label');
  if (!label) {
    label = document.createElement('span');
    label.className = 'aero-skip-btn-label';
    while (el.firstChild) label.append(el.firstChild);
    el.append(label);
  }
  return label;
}

function emit(el, type, detail) {
  el.dispatchEvent(new CustomEvent(type, { bubbles: true, detail }));
}

function tap(el) {
  const p = el.dataset.haptics;
  if (!p || p === 'off') return;
  if ('vibrate' in navigator) {
    try { navigator.vibrate(PATTERNS[p] ?? PATTERNS.light); } catch { /* noop */ }
  }
}

function reducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function currentScale(el) {
  try {
    return new DOMMatrix(getComputedStyle(el).transform).a || 1;
  } catch {
    return 1;
  }
}

function scaleTo(inst, pressed) {
  const fromBtn = currentScale(inst.el);
  const fromLabel = currentScale(inst.label);
  const toBtn = pressed ? 0.85 : 1;
  const toLabel = pressed ? 0.9 : 1;
  inst._btnAnim?.cancel();
  inst._labelAnim?.cancel();
  if (reducedMotion()) return;
  try {
    inst._btnAnim = animate(inst.el,
      [{ transform: `scale(${fromBtn})` }, { transform: `scale(${toBtn})` }],
      { spring: PRESS_SPRING });
    inst._labelAnim = animate(inst.label,
      [{ transform: `scale(${fromLabel})` }, { transform: `scale(${toLabel})` }],
      { spring: PRESS_SPRING });
  } catch {
    inst.el.style.transform = `scale(${toBtn})`;
    inst.label.style.transform = `scale(${toLabel})`;
  }
}

function watchLabel(inst, label) {
  const mo = new MutationObserver(() => {
    if (reducedMotion()) return;
    inst._swap?.cancel();
    const a = animate(label, [
      { opacity: 0, transform: 'scale(0.6)', filter: 'blur(4px)' },
      { opacity: 1, transform: 'scale(1)', filter: 'blur(0px)' },
    ], { spring: { duration: 0.3, bounce: 0.3 } });
    a.finished.then(() => a.cancel()).catch(() => {});
    inst._swap = a;
  });
  mo.observe(label, { childList: true, characterData: true, subtree: true });
  inst._mo = mo;
}

function beginPress(inst) {
  const { el } = inst;
  if (isDisabled(el) || inst.held) return false;
  clearTimeout(inst.hideT);
  clearTimeout(inst._releaseT);
  inst.held = true;
  inst.downT = performance.now();
  el.classList.add('aero-skip-btn--pressed', 'aero-skip-btn--circle');
  scaleTo(inst, true);
  tap(el);
  emit(el, 'pressstart', {});
  const ms = intervalSec(el) * 1000;
  clearInterval(inst.timer);
  inst.timer = setInterval(() => {
    if (!inst.held) return;
    emit(el, 'pressing', { elapsed: (performance.now() - inst.downT) / 1000 });
  }, ms);
  return true;
}

function endPress(inst, { cancelled = false } = {}) {
  const { el } = inst;
  if (!inst.held) return false;
  inst.held = false;
  clearInterval(inst.timer);
  inst.lastEnd = Date.now();
  const elapsed = (performance.now() - inst.downT) / 1000;
  el.classList.remove('aero-skip-btn--pressed');

  if (!cancelled) emit(el, 'pressend', { elapsed });

  const heldMs = performance.now() - inst.downT;
  const wait = Math.max(0, MIN_HOLD_MS - heldMs);
  clearTimeout(inst._releaseT);
  inst._releaseT = setTimeout(() => {
    scaleTo(inst, false);
    clearTimeout(inst.hideT);
    inst.hideT = setTimeout(() => el.classList.remove('aero-skip-btn--circle'), HIDE_DELAY_MS);
  }, wait);

  return true;
}

function initSkipButton(el) {
  if (el._aeroSkipBtn) return el._aeroSkipBtn;
  if (!/^(BUTTON|A)$/.test(el.tagName)) {
    el.setAttribute('role', el.getAttribute('role') || 'button');
    if (!el.hasAttribute('tabindex')) el.tabIndex = isDisabled(el) ? -1 : 0;
  }
  const label = ensureLabel(el);
  const inst = {
    el, label,
    held: false, downT: 0, timer: null, hideT: null, _releaseT: null,
    lastEnd: 0, _swap: null, _mo: null,
  };
  el._aeroSkipBtn = inst;
  watchLabel(inst, label);

  el.addEventListener('pointerdown', e => {
    if (isDisabled(el)) return;
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    try { el.focus({ preventScroll: true, focusVisible: false }); }
    catch { try { el.focus(); } catch { /* noop */ } }
    try { el.setPointerCapture(e.pointerId); } catch { /* noop */ }
    inst._pointerId = e.pointerId;
    beginPress(inst);
  });

  el.addEventListener('pointerup', e => {
    if (inst._pointerId !== undefined && e.pointerId !== inst._pointerId) return;
    inst._pointerId = undefined;
    endPress(inst);
  });
  el.addEventListener('pointercancel', () => {
    inst._pointerId = undefined;
    endPress(inst, { cancelled: true });
  });
  el.addEventListener('lostpointercapture', () => {
    inst._pointerId = undefined;
    endPress(inst, { cancelled: true });
  });
  el.addEventListener('contextmenu', e => {
    if (inst.held) e.preventDefault();
  });

  el.addEventListener('keydown', e => {
    if (isDisabled(el) || e.repeat) return;
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    beginPress(inst);
  });
  el.addEventListener('keyup', e => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    endPress(inst);
  });

  el.addEventListener('click', () => {
    if (isDisabled(el) || inst.held) return;
    if (Date.now() - inst.lastEnd < ECHO_GUARD_MS) return;
    if (beginPress(inst)) setTimeout(() => endPress(inst), 140);
  });

  return inst;
}

function initSkipButtons(root = document) {
  root.querySelectorAll('.aero-skip-btn').forEach(initSkipButton);
}

document.addEventListener('DOMContentLoaded', () => initSkipButtons());

/* SF Symbols-style skip glyphs (forward.fill / backward.fill parity).
 * Clean-room traced from Apple's SF Symbols medium weight — forward is a
 * play triangle + ghost triangle, backward is the horizontal mirror.
 * ViewBox normalized to 24x24 so they sit perfectly in the button frame. */
const SKIP_ICONS = {
  forward: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 6.8 4 17.2Q4 21 7.31 19.14L18.26 12.98Q20 12 18.26 11.02L7.31 4.86Q4 3 4 6.8Z"/><rect x="13.28" y="3" width="5.45" height="18" rx="1.3"/></svg>',
  backward: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20 6.8 20 17.2Q20 21 16.69 19.14L5.74 12.98Q4 12 5.74 11.02L16.69 4.86Q20 3 20 6.8Z"/><rect x="5.27" y="3" width="5.45" height="18" rx="1.3"/></svg>',
};

/* Swap the label icon with the symbol-replace animation (via watchLabel).
 * name: "forward" | "backward". Also keeps aria-label in sync. */
function setSkipIcon(el, name) {
  const inst = el._aeroSkipBtn ?? initSkipButton(el);
  inst.label.innerHTML = SKIP_ICONS[name] ?? SKIP_ICONS.forward;
  el.setAttribute('aria-label', name === 'backward' ? 'Previous' : 'Next');
}

export { initSkipButtons, initSkipButton, SKIP_ICONS, setSkipIcon };