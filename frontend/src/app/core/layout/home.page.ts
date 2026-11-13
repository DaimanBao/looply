import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionService } from '../auth/session.service';

@Component({
  imports: [RouterLink],
  template: `
    <section class="home-hero">
      <div>
        <span class="eyebrow">KẾT NỐI TỪ NHỮNG ĐIỀU QUEN THUỘC</span>
        <h1>Đồ dùng tiếp nối.<br /><em>Cộng đồng gần hơn.</em></h1>
        <p>
          Cho món đồ của bạn một hành trình mới. Xây dựng hồ sơ, kết nối với những người xung quanh
          và bắt đầu cùng Looply.
        </p>
        <a class="button primary" [routerLink]="auth.active() ? '/account' : '/auth/register'"
          >{{ auth.active() ? 'Đến tài khoản của tôi' : 'Bắt đầu kết nối' }} →</a
        >
      </div>
      <div class="home-art" aria-hidden="true">
        <span>↻</span>
        <div class="art-label">Một món đồ.<br />Nhiều câu chuyện.</div>
      </div>
    </section>
    <div class="intro-grid">
      <article>
        <span class="step-number">01</span>
        <h2>Giới thiệu bản thân</h2>
        <p>Hoàn thiện hồ sơ để những kết nối mới bắt đầu bằng sự tin cậy.</p>
      </article>
      <article>
        <span class="step-number">02</span>
        <h2>Tìm người đồng điệu</h2>
        <p>Theo dõi thành viên và xây dựng vòng kết nối của riêng bạn.</p>
      </article>
      <article>
        <span class="step-number">03</span>
        <h2>Chủ động bảo vệ tài khoản</h2>
        <p>Quản lý phiên đăng nhập và thông tin liên hệ trong cùng một nơi.</p>
      </article>
    </div>
  `,
})
export class HomePage {
  readonly auth = inject(SessionService);
}
