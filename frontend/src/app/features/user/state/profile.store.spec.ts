import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { SessionService } from '../../../core/auth/session.service';
import type { PrivateProfile } from '../../../core/http/api.models';
import { UserApi } from '../data-access/user.api';
import { ProfileStore } from './profile.store';

describe('Private profile cache', () => {
  it.each(['read', 'mutation', 'another login'])(
    'does not cache an old owner response after %s loses authority',
    async (scenario) => {
      let resolveProfile!: (profile: PrivateProfile) => void;
      const response = new Promise<PrivateProfile>((resolve) => {
        resolveProfile = resolve;
      });
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: UserApi, useValue: { me: () => response } },
        ],
      });
      const session = TestBed.inject(SessionService);
      session.accept({ accessToken: 'owner', expiresIn: 900, status: 'ACTIVE' });
      const store = TestBed.inject(ProfileStore);
      TestBed.tick();
      const loading = scenario === 'read' ? store.load() : store.retainResponse(() => response);
      // Theo dõi rejection trước khi hoàn tất yêu cầu cũ.
      const settled = loading.catch(() => undefined);
      session.clear();
      if (scenario === 'another login')
        session.accept({ accessToken: 'another-owner', expiresIn: 900, status: 'ACTIVE' });
      TestBed.tick();
      resolveProfile({
        id: 'previous-owner',
        username: 'previous_owner',
        displayName: 'Previous owner',
        bio: null,
        province: null,
        avatarUrl: null,
        followers: 0,
        following: 0,
        email: 'private@example.com',
        emailVerifiedAt: null,
        phone: null,
        phoneVerifiedAt: null,
        status: 'ACTIVE',
        deletionRequestedAt: null,
        usernameChangedAt: null,
      });
      await settled;
      expect(store.profile()).toBeNull();
    },
  );
});
