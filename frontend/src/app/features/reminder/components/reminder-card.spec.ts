import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import type { ReminderField } from '../models/reminder.models';
import { ReminderState } from '../state/reminder.state';
import { ReminderCard } from './reminder-card';

describe('ReminderCard', () => {
  it('renders one nonblocking card with the correct update links and later/close actions', async () => {
    const state = {
      items: signal<ReminderField[]>(['PHONE', 'EMAIL', 'PROVINCE']),
      loading: signal(false),
      error: signal(''),
      dismiss: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [ReminderCard],
      providers: [provideRouter([]), { provide: ReminderState, useValue: state }],
    });
    const fixture = TestBed.createComponent(ReminderCard);
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelectorAll('aside')).toHaveLength(1);
    expect(element.querySelector('[role=dialog]')).toBeNull();
    expect([...element.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([
      '/account/contacts?kind=phone',
      '/account/contacts?kind=email',
      '/account/edit#province',
    ]);
    element.querySelector<HTMLButtonElement>('button[aria-label]')?.click();
    expect(state.dismiss).toHaveBeenCalledTimes(1);
    state.items.set([]);
    fixture.detectChanges();
    expect(element.querySelector('aside')).toBeNull();
    state.error.set('Offline');
    fixture.detectChanges();
    expect(element.textContent).toContain('Thử lại');
    expect(element.textContent).toContain('Để sau');
  });
});
