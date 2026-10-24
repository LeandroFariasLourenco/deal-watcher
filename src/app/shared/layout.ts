import { DestroyRef, inject, signal, Signal } from '@angular/core';

const MOBILE_MQ = '(max-width: 639px)';

export function injectIsMobile(): Signal<boolean> {
  const matches = signal(typeof window !== 'undefined' && window.matchMedia(MOBILE_MQ).matches);
  if (typeof window === 'undefined') return matches;

  const mq = window.matchMedia(MOBILE_MQ);
  const onChange = () => matches.set(mq.matches);
  mq.addEventListener('change', onChange);
  inject(DestroyRef).onDestroy(() => mq.removeEventListener('change', onChange));
  return matches;
}
