import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE } from '../../../core/http/api.config';
import type {
  AuthSession,
  ContactChange,
  PrivateProfile,
  ProfilePage,
  ProfilePatch,
  Province,
  PublicProfile,
} from '../../../core/http/api.models';

@Injectable({ providedIn: 'root' })
export class UserApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE);
  /** Loads the active server-owned catalog without a duplicated local list. */
  provinces(): Promise<Province[]> {
    return firstValueFrom(this.http.get<Province[]>(`${this.base}/provinces`));
  }
  /** Retrieves private fields only from the current owner endpoint. */
  me(): Promise<PrivateProfile> {
    return firstValueFrom(this.http.get<PrivateProfile>(`${this.base}/users/me`));
  }
  /** Reads the block-aware public projection. */
  profile(id: string): Promise<PublicProfile> {
    return firstValueFrom(
      this.http.get<PublicProfile>(`${this.base}/users/${encodeURIComponent(id)}`),
    );
  }
  /** Sends only editable profile fields, leaving contact ownership to Auth. */
  update(patch: ProfilePatch): Promise<PrivateProfile> {
    return firstValueFrom(this.http.patch<PrivateProfile>(`${this.base}/users/me`, patch));
  }
  /** Lets the server enforce uniqueness and the 30-day atomic cooldown. */
  username(username: string): Promise<PrivateProfile> {
    return firstValueFrom(
      this.http.patch<PrivateProfile>(`${this.base}/users/me/username`, {
        username: username.toLowerCase(),
      }),
    );
  }
  /** Commits a newly verified contact with a one-use operation proof. */
  contact(kind: 'email' | 'phone', input: ContactChange): Promise<void> {
    return firstValueFrom(this.http.patch<void>(`${this.base}/users/me/${kind}`, input));
  }
  /** Changes the password while the server revokes other devices. */
  password(password: string, reauthProof: string): Promise<void> {
    return firstValueFrom(
      this.http.patch<void>(`${this.base}/users/me/password`, { password, reauthProof }),
    );
  }
  /** Returns safe metadata for the caller's own sessions. */
  sessions(): Promise<AuthSession[]> {
    return firstValueFrom(this.http.get<AuthSession[]>(`${this.base}/auth/sessions`));
  }
  /** Revokes exactly the caller-selected session. */
  revoke(id: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${this.base}/auth/sessions/${encodeURIComponent(id)}`),
    );
  }
  /** Submits raw bytes rather than multipart or a storage key. */
  avatar(file: File): Promise<PrivateProfile> {
    return firstValueFrom(
      this.http.put<PrivateProfile>(`${this.base}/users/me/avatar`, file, {
        headers: { 'Content-Type': 'application/octet-stream' },
      }),
    );
  }
  /** Removes only the owner's avatar pointer. */
  removeAvatar(): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.base}/users/me/avatar`));
  }
  /** Fetches private/block-aware image bytes through the authenticated HTTP stack. */
  avatarImage(id: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${this.base}/users/${encodeURIComponent(id)}/avatar`, {
        responseType: 'blob',
      }),
    );
  }
  /** Uses the server cursor unchanged and never derives pagination from displayed rows. */
  related(
    id: string,
    kind: 'followers' | 'following' | 'blocked',
    after?: string,
  ): Promise<ProfilePage> {
    const path = kind === 'blocked' ? 'me/blocked' : `${encodeURIComponent(id)}/${kind}`;
    let params = new HttpParams().set('limit', 20);
    if (after) params = params.set('after', after);
    return firstValueFrom(this.http.get<ProfilePage>(`${this.base}/users/${path}`, { params }));
  }
  /** Executes idempotent relationship endpoints; block cleanup is owned by the server. */
  relationship(id: string, kind: 'follow' | 'block', enabled: boolean): Promise<void> {
    const url = `${this.base}/users/${encodeURIComponent(id)}/${kind}`;
    return firstValueFrom(enabled ? this.http.put<void>(url, {}) : this.http.delete<void>(url));
  }
  /** Starts the server-managed waiting period; this endpoint revokes every session. */
  requestDeletion(reauthProof: string): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(
        `${this.base}/users/me/deletion`,
        { reauthProof },
        { withCredentials: true },
      ),
    );
  }
  /** Explicitly cancels a pending request; never runs automatically at login. */
  cancelDeletion(): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.base}/users/me/deletion`));
  }
}
