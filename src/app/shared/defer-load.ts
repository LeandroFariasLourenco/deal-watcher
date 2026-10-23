import { AfterViewInit, DestroyRef, Directive, ElementRef, OnDestroy, effect, inject, input, output } from '@angular/core';

@Directive({
  selector: '[appDeferLoad]',
  standalone: true,
})
export class DeferLoadDirective implements AfterViewInit, OnDestroy {
  readonly appDeferLoad = input<string | null>(null);
  readonly appeared = output<void>();

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  private observer: IntersectionObserver | null = null;
  private emittedFor: string | null = null;
  private viewReady = false;

  constructor() {
    this.destroyRef.onDestroy(() => this.disconnect());
    effect(() => {
      const key = this.appDeferLoad();
      if (!this.viewReady) return;
      if (this.emittedFor !== null && this.emittedFor !== (key ?? '')) {
        this.emittedFor = null;
        this.observe();
      }
    });
  }

  ngAfterViewInit() {
    this.viewReady = true;
    this.observe();
  }

  ngOnDestroy() {
    this.disconnect();
  }

  private observe() {
    this.disconnect();
    const root = document.querySelector('main.app-content') || document.querySelector('main');
    this.observer = new IntersectionObserver(
      entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        const key = this.appDeferLoad() ?? '';
        if (this.emittedFor === key) return;
        this.emittedFor = key;
        this.appeared.emit();
      },
      {
        root,
        rootMargin: '280px 0px',
        threshold: 0.01,
      }
    );
    this.observer.observe(this.host.nativeElement);
  }

  private disconnect() {
    this.observer?.disconnect();
    this.observer = null;
  }
}
