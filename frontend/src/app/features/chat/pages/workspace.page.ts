import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { InboxPage } from './inbox.page';
import { InboxState } from '../state/inbox.state';

@Component({
  selector: 'app-chat-workspace',
  imports: [InboxPage, RouterOutlet],
  providers: [InboxState],
  templateUrl: './workspace.page.html',
  styleUrl: './workspace.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatWorkspace {
  readonly state = inject(InboxState);
  private readonly router = inject(Router);
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  readonly selectedId = computed(
    () => /^\/chat\/([0-9a-f-]{36})(?:[?#]|$)/i.exec(this.url())?.[1] ?? '',
  );
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('hideDialog');

  /** Dialog native quản lý focus và Escape; xác nhận vẫn dùng mutation ẩn hiện có. */
  constructor() {
    afterRenderEffect(() => {
      const dialog = this.dialog()?.nativeElement;
      if (!dialog) return;
      if (this.state.confirm() && !dialog.open) dialog.showModal();
      else if (!this.state.confirm() && dialog.open) dialog.close();
    });
  }

  /** Rời màn hình hội thoại vừa ẩn, giữ lịch sử phía đối tác. */
  async hide(): Promise<void> {
    const id = this.state.confirm();
    if (id && (await this.state.hide(id)) && this.selectedId() === id)
      await this.router.navigateByUrl('/chat');
  }
}
