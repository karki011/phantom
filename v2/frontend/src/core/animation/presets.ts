// Author: Subash Karki

import { gsap } from './gsap-setup';

export function entranceTimeline(el: HTMLElement, opts?: { y?: number; duration?: number }) {
  return gsap.timeline({ paused: true })
    .from(el, {
      autoAlpha: 0,
      y: opts?.y ?? 12,
      duration: opts?.duration ?? 0.4,
      ease: 'power2.out',
    });
}

export function exitTimeline(el: HTMLElement) {
  return gsap.timeline({ paused: true })
    .to(el, { autoAlpha: 0, y: -8, duration: 0.3, ease: 'power2.in' });
}

export function shakeTimeline(el: HTMLElement) {
  return gsap.timeline({ paused: true })
    .to(el, { x: -6, duration: 0.06 })
    .to(el, { x: 6, duration: 0.06 })
    .to(el, { x: -3, duration: 0.06 })
    .to(el, { x: 0, duration: 0.06 });
}

export function successFlash(el: HTMLElement) {
  return gsap.timeline({ paused: true })
    .fromTo(el,
      { boxShadow: '0 0 20px rgba(34, 197, 94, 0.4)', borderColor: '#22c55e' },
      { boxShadow: '0 0 0px transparent', borderColor: 'transparent', duration: 0.8, ease: 'power2.out' },
    );
}

export function scalePress(el: HTMLElement) {
  return gsap.to(el, {
    scale: 0.95,
    duration: 0.1,
    yoyo: true,
    repeat: 1,
    paused: true,
    ease: 'power2.inOut',
  });
}
