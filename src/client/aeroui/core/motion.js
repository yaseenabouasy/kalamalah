/* Motion utilities — minimal WAAPI spring wrapper.
 * Used by player-button.js for press animations. */

/**
 * Animate an element with a spring-like feel using WAAPI.
 * @param {Element} el - Element to animate
 * @param {Keyframe[]} keyframes - Array of keyframe objects
 * @param {Object} options - { spring: { duration, bounce } }
 * @returns {Animation} WAAPI Animation instance
 */
export function animate(el, keyframes, options = {}) {
  const { spring } = options;
  const duration = spring?.duration ?? 0.5;
  const bounce = spring?.bounce ?? 0;

  // WAAPI doesn't have native spring; approximate with a custom easing
  // For now, use a cubic-bezier that mimics a damped spring
  const easing = bounce > 0
    ? `cubic-bezier(0.34, ${1.3 + bounce * 0.5}, 0.64, 1)`
    : 'cubic-bezier(0.34, 1.3, 0.64, 1)';

  const anim = el.animate(keyframes, {
    duration: duration * 1000,
    easing,
    fill: 'both',
  });

  return anim;
}