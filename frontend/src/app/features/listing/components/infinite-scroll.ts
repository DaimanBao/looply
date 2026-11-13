import {
  Directive,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  output,
} from '@angular/core';

@Directive({ selector: '[appInfiniteScroll]' })
export class InfiniteScroll {
  readonly enabled = input(false);
  readonly loadNext = output<void>();
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private observer?: IntersectionObserver;

  /** Chỉ quan sát trang được bật sau render trình duyệt và ngắt khi trạng thái/vòng đời đổi. */
  constructor() {
    afterNextRender(() => {
      if (typeof IntersectionObserver === 'undefined') return;
      this.observer = new IntersectionObserver(
        (entries) => {
          if (this.enabled() && entries.some((entry) => entry.isIntersecting)) this.loadNext.emit();
        },
        { rootMargin: '240px' },
      );
      if (this.enabled()) this.observer.observe(this.element.nativeElement);
    });
    effect((onCleanup) => {
      if (this.enabled()) this.observer?.observe(this.element.nativeElement);
      else this.observer?.disconnect();
      onCleanup(() => this.observer?.disconnect());
    });
  }
}
