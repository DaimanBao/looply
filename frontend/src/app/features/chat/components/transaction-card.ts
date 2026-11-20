import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { ChatMessage } from '../models/chat.models';
import { ChatImage } from './chat-image';

@Component({
  selector: 'app-transaction-card',
  imports: [ChatImage],
  templateUrl: './transaction-card.html',
  styleUrl: './transaction-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionCard {
  readonly message = input.required<ChatMessage>();
  readonly canResolve = input(false);
  readonly busy = input(false);
  readonly decision = output<{ id: string; status: 'ACCEPTED' | 'REJECTED' }>();
  readonly types = { SALE: 'Mua bán', RENT: 'Cho thuê', EXCHANGE: 'Trao đổi' };
}
