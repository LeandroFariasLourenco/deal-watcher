import { DestroyRef, Directive, ElementRef, inject } from '@angular/core';

@Directive({
  selector: 'img',
  standalone: true,
})
export class ImgShimmerDirective {
  private readonly img = inject(ElementRef<HTMLImageElement>).nativeElement;
  private overlay: HTMLElement | null = null;
  private hostClassAdded = false;
  private resizeObserver: ResizeObserver | null = null;
  private mutationObserver: MutationObserver | null = null;

  constructor() {
    this.start();
    inject(DestroyRef).onDestroy(() => this.cleanup());
  }

  private start() {
    this.sync();
    this.img.addEventListener('load', this.onSettled);
    this.img.addEventListener('error', this.onSettled);
    this.mutationObserver = new MutationObserver(() => this.sync());
    this.mutationObserver.observe(this.img, { attributes: true, attributeFilter: ['src'] });
  }

  private readonly onSettled = () => {
    if (this.img.complete) {
      this.hide();
    }
  };

  private sync() {
    if (!this.img.getAttribute('src') && !this.img.src) {
      this.hide();
      return;
    }
    if (this.img.complete && this.img.naturalWidth > 0) {
      this.hide();
      return;
    }
    this.show();
  }

  private show() {
    const parent = this.img.parentElement;
    if (!parent) return;

    if (getComputedStyle(parent).position === 'static') {
      parent.classList.add('img-shimmer-host');
      this.hostClassAdded = true;
    }

    if (!this.overlay) {
      this.overlay = document.createElement('span');
      this.overlay.className = 'img-shimmer-overlay';
      this.overlay.setAttribute('aria-hidden', 'true');
      parent.insertBefore(this.overlay, this.img.nextSibling);
      this.resizeObserver = new ResizeObserver(() => this.syncOverlayBox());
      this.resizeObserver.observe(this.img);
      this.resizeObserver.observe(parent);
    }

    this.img.classList.add('img-shimmer');
    this.syncOverlayBox();
  }

  private syncOverlayBox() {
    if (!this.overlay) return;
    const parent = this.img.parentElement;
    if (!parent) return;

    const width = this.img.offsetWidth || parent.clientWidth;
    const height = this.img.offsetHeight || parent.clientHeight;
    if (width <= 0 || height <= 0) {
      this.overlay.style.display = 'none';
      return;
    }

    this.overlay.style.display = 'block';
    this.overlay.style.top = `${this.img.offsetTop}px`;
    this.overlay.style.left = `${this.img.offsetLeft}px`;
    this.overlay.style.width = `${width}px`;
    this.overlay.style.height = `${height}px`;
  }

  private hide() {
    this.img.classList.remove('img-shimmer');
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.overlay?.remove();
    this.overlay = null;
    if (this.hostClassAdded) {
      this.img.parentElement?.classList.remove('img-shimmer-host');
      this.hostClassAdded = false;
    }
  }

  private cleanup() {
    this.img.removeEventListener('load', this.onSettled);
    this.img.removeEventListener('error', this.onSettled);
    this.mutationObserver?.disconnect();
    this.mutationObserver = null;
    this.hide();
  }
}
