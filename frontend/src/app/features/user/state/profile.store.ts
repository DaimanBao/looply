import { Injectable, effect, inject, signal } from '@angular/core';
import { UserApi } from '../data-access/user.api';
import type { PrivateProfile } from '../../../core/http/api.models';
import { SessionService } from '../../../core/auth/session.service';

@Injectable({ providedIn: 'root' })
export class ProfileStore {
  private readonly api = inject(UserApi);
  private readonly session = inject(SessionService);
  readonly profile = signal<PrivateProfile | null>(null);
  /** Removes private cached fields when authority is cleared, including failed cookie restoration. */
  constructor() {
    effect(() => {
      if (!this.session.authenticated()) this.profile.set(null);
    });
  }
  /** Fetches the current owner's data on each protected page rather than retaining another user's cache. */
  async load(): Promise<PrivateProfile> {
    return this.retainResponse(() => this.api.me());
  }
  /** Applies reads and mutations only while their originating login still owns the cache. */
  async retainResponse(request: () => Promise<PrivateProfile>): Promise<PrivateProfile> {
    const identityVersion = this.session.identityVersion();
    const profile = await request();
    if (identityVersion !== this.session.identityVersion() || !this.session.authenticated())
      throw new Error('Phiên đã thay đổi.');
    this.profile.set(profile);
    return profile;
  }
}
