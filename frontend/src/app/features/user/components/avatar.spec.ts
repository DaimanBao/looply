import { TestBed } from '@angular/core/testing';
import { Avatar } from './avatar';
import { UserApi } from '../data-access/user.api';

describe('Protected avatar', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('loads once per profile change and releases object URLs without a signal fetch loop', async () => {
    const load = vi.fn().mockResolvedValue(new Blob(['test'], { type: 'image/webp' }));
    const revoke = vi.fn();
    vi.stubGlobal(
      'URL',
      Object.assign(class extends URL {}, {
        createObjectURL: vi.fn(() => 'blob:fixture'),
        revokeObjectURL: revoke,
      }),
    );
    TestBed.configureTestingModule({
      imports: [Avatar],
      providers: [{ provide: UserApi, useValue: { avatarImage: load } }],
    });
    const fixture = TestBed.createComponent(Avatar);
    fixture.componentRef.setInput('profile', {
      id: 'owner',
      displayName: 'Nguyễn',
      avatarUrl: '/api/users/owner/avatar',
    });
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.image()).toBe('blob:fixture'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(load).toHaveBeenCalledTimes(1);
    expect((fixture.nativeElement as HTMLElement).querySelector('img')?.alt).toBe(
      'Ảnh đại diện của Nguyễn',
    );
    fixture.destroy();
    expect(revoke).toHaveBeenCalledWith('blob:fixture');
  });
});
