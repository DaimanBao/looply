import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionService } from '../auth/session.service';

@Component({
  imports: [RouterLink],
  templateUrl: './home.page.html',
})
export class HomePage {
  readonly auth = inject(SessionService);
}
