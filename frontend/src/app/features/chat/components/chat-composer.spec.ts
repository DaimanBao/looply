import { TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { vi } from 'vitest';
import { ChatComposer } from './chat-composer';

describe('ChatComposer', () => {
  it('sends on Enter but preserves Shift+Enter and IME input', async () => {
    const fixture = TestBed.createComponent(ChatComposer);
    fixture.componentRef.setInput('content', new FormControl('Xin chào 😀', { nonNullable: true }));
    await fixture.whenStable();
    const sent = vi.fn();
    fixture.componentInstance.sent.subscribe(sent);
    const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea');
    textarea.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    textarea.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        isComposing: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(sent).not.toHaveBeenCalled();
    textarea.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    expect(sent).toHaveBeenCalledTimes(1);
    expect(textarea.value).toBe('Xin chào 😀');
  });

  it('validates Unicode code points, attachment-only messages and busy state', async () => {
    const fixture = TestBed.createComponent(ChatComposer);
    const content = new FormControl(' '.repeat(3), { nonNullable: true });
    fixture.componentRef.setInput('content', content);
    await fixture.whenStable();
    expect(fixture.componentInstance.valid()).toBe(false);
    content.setValue('😀'.repeat(5000));
    expect(fixture.componentInstance.valid()).toBe(true);
    content.setValue('😀'.repeat(5001));
    expect(fixture.componentInstance.valid()).toBe(false);
    content.reset();
    fixture.componentRef.setInput('preview', 'blob:fixture');
    await fixture.whenStable();
    expect(fixture.componentInstance.valid()).toBe(true);
    fixture.componentRef.setInput('busy', true);
    await fixture.whenStable();
    expect(fixture.componentInstance.valid()).toBe(false);
    expect(fixture.nativeElement.querySelector('button[type=submit]').disabled).toBe(true);
  });

  it('keeps a failed-send draft owned by the page and supports removing an attachment', async () => {
    const fixture = TestBed.createComponent(ChatComposer);
    const content = new FormControl('Giữ bản nháp', { nonNullable: true });
    fixture.componentRef.setInput('content', content);
    fixture.componentRef.setInput('preview', 'blob:fixture');
    fixture.componentRef.setInput('error', 'Upload thất bại, vui lòng thử lại.');
    await fixture.whenStable();
    const removed = vi.fn();
    fixture.componentInstance.removed.subscribe(removed);
    fixture.nativeElement.querySelector('button[type=submit]').click();
    expect(content.value).toBe('Giữ bản nháp');
    expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain(
      'Upload thất bại',
    );
    fixture.nativeElement.querySelector('button[aria-label="Bỏ ảnh đã chọn"]').click();
    expect(removed).toHaveBeenCalledTimes(1);
  });
});
