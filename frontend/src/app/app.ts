import { Component, effect, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SessionService } from './core/auth/session.service';
import { ActionState } from './shared/ui/action-state';
import { Feedback } from './shared/ui/feedback';
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Feedback],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly session = inject(SessionService);
  private readonly router = inject(Router);
  readonly logoutState = new ActionState();
  /** Leaves private screens when revocation or an expired cookie removes client authority. */
  constructor() {
    effect(() => {
      if (!this.session.authenticated() && this.router.url.startsWith('/account'))
        void this.router.navigateByUrl('/auth/login');
    });
  }
  /** Keeps revocation failures visible so logout can be retried safely. */
  async logout(): Promise<void> {
    await this.logoutState.run(async () => {
      await firstValueFrom(this.session.logout());
      await this.router.navigateByUrl('/auth/login');
    });
  }
}
