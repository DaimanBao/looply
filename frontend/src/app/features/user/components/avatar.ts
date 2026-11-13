import { Component, OnDestroy, effect, inject, input, signal, untracked } from '@angular/core';
import type { PublicProfile } from '../../../core/http/api.models';
import { UserApi } from '../data-access/user.api';

@Component({
  selector: 'app-avatar',
  template: `@if (image()) {
      <img class="avatar" [src]="image()" [alt]="'Ảnh đại diện của ' + profile().displayName" />
    } @else {
      <span class="avatar avatar-placeholder" aria-hidden="true">{{
        profile().displayName.slice(0, 1).toUpperCase()
      }}</span>
    }`,
})
export class Avatar implements OnDestroy {
  private readonly api = inject(UserApi);
  readonly profile = input.required<PublicProfile>();
  readonly image = signal('');
  private revision = 0;
  /** Loads protected image bytes and discards late responses after navigation or profile changes. */
  constructor() {
    effect(() => {
      const profile = this.profile();
      const revision = ++this.revision;
      untracked(() => this.release());
      if (profile.avatarUrl)
        void this.api
          .avatarImage(profile.id)
          .then((blob) => {
            if (revision === this.revision) this.image.set(URL.createObjectURL(blob));
          })
          .catch(() => {
            /* Missing/hidden images render initials, never a stale previous avatar. */
          });
    });
  }
  /** Releases browser-owned bytes as soon as they are no longer displayed. */
  private release(): void {
    if (this.image()) URL.revokeObjectURL(this.image());
    this.image.set('');
  }
  /** Invalidates pending requests and releases the current object URL. */
  ngOnDestroy(): void {
    this.revision++;
    this.release();
  }
}
