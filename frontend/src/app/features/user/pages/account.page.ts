import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProfileStore } from '../state/profile.store';
import { ActionState } from '../../../shared/ui/action-state';
import { Feedback } from '../../../shared/ui/feedback';
import { Avatar } from '../components/avatar';

@Component({
  imports: [RouterLink, Feedback, Avatar],
  templateUrl: './account.page.html',
})
export class AccountPage implements OnInit {
  readonly store = inject(ProfileStore);
  readonly state = new ActionState();

  /** Làm mới dữ liệu riêng khi vào trang. */
  ngOnInit(): void {
    void this.load();
  }

  /** Hỗ trợ thử lại sau lỗi API tạm thời. */
  async load(): Promise<void> {
    this.store.profile.set(null);
    await this.state.run(async () => {
      await this.store.load();
    });
  }
}
