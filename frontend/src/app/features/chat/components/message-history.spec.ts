import { TestBed } from '@angular/core/testing';
import { MessageHistory } from './message-history';

describe('MessageHistory scroll', () => {
  it('keeps the latest position across geometry changes while preserving intentional history reading', async () => {
    const fixture = TestBed.createComponent(MessageHistory);
    fixture.componentRef.setInput('messages', []);
    fixture.componentRef.setInput('scope', 'account:chat');
    await fixture.whenStable();
    const viewport: HTMLElement = fixture.nativeElement.querySelector('.messages');
    let height = 1000;
    let top = 600;
    Object.defineProperties(viewport, {
      scrollHeight: { get: () => height },
      clientHeight: { get: () => 400 },
      scrollTop: {
        get: () => top,
        set: (value: number) => {
          top = Math.min(Math.max(value, 0), height - 400);
        },
      },
    });
    fixture.componentInstance.scroll();
    height = 1400;
    fixture.componentInstance.scroll();
    expect(top).toBe(1000);
    viewport.scrollTop = 100;
    fixture.componentInstance.scroll();
    height = 1500;
    fixture.componentInstance.scroll();
    expect(top).toBe(100);
    fixture.componentInstance.latest();
    expect(top).toBe(1100);
  });
});
