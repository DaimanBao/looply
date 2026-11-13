import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { InfiniteScroll } from './infinite-scroll';

@Component({
  imports: [InfiniteScroll],
  template: `<div
    appInfiniteScroll
    [enabled]="enabled()"
    (loadNext)="loads.set(loads() + 1)"
  ></div>`,
})
class ScrollHost {
  readonly enabled = signal(true);
  readonly loads = signal(0);
}

describe('Infinite scroll lifecycle', () => {
  it('loads only enabled intersections and disconnects on destruction', async () => {
    let intersect: (visible: boolean) => void = () => undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    class Observer {
      /** Chuyển callback trình duyệt thành sentinel hiển thị xác định cho test này. */
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        intersect = (visible) => callback([{ isIntersecting: visible }]);
      }
      observe = observe;
      disconnect = disconnect;
    }
    vi.stubGlobal('IntersectionObserver', Observer);
    const fixture = TestBed.createComponent(ScrollHost);
    await fixture.whenStable();
    expect(observe).toHaveBeenCalled();
    intersect(false);
    expect(fixture.componentInstance.loads()).toBe(0);
    intersect(true);
    expect(fixture.componentInstance.loads()).toBe(1);
    fixture.componentInstance.enabled.set(false);
    await fixture.whenStable();
    intersect(true);
    expect(fixture.componentInstance.loads()).toBe(1);
    fixture.destroy();
    expect(disconnect).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
