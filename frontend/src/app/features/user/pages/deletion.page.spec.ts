import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { DeletionPage } from './deletion.page';
import { ProfileStore } from '../state/profile.store';
import { SessionService } from '../../../core/auth/session.service';

describe('Pending deletion screen', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      imports: [DeletionPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }),
  );
  it('never automatically cancels deletion and requires explicit confirmation', async () => {
    TestBed.inject(SessionService).accept({
      accessToken: 'pending-owner',
      expiresIn: 900,
      status: 'PENDING_DELETION',
    });
    const fixture = TestBed.createComponent(DeletionPage);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/users/me').flush({
      id: 'owner',
      status: 'PENDING_DELETION',
      deletionRequestedAt: new Date().toISOString(),
    });
    await vi.waitFor(() => expect(TestBed.inject(ProfileStore).profile()).not.toBeNull());
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('Đăng nhập không tự hủy yêu cầu xóa');
    const buttons = [...element.querySelectorAll('button')];
    expect(buttons.find((button) => button.textContent?.includes('Xác nhận hủy'))?.disabled).toBe(
      true,
    );
    await fixture.componentInstance.cancel();
    http.expectNone((request) => request.method === 'DELETE');
    http.verify();
  });
  it('offers no cancellation for an irreversible account state', async () => {
    TestBed.inject(SessionService).accept({
      accessToken: 'owner',
      expiresIn: 900,
      status: 'ACTIVE',
    });
    const fixture = TestBed.createComponent(DeletionPage);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/users/me').flush({ id: 'owner', status: 'DELETING' });
    await vi.waitFor(() => expect(TestBed.inject(ProfileStore).profile()).not.toBeNull());
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('không thể khôi phục');
    expect(element.querySelector('input[type="checkbox"]')).toBeNull();
    http.verify();
  });
});
