import { lockResources } from "../../shared/database/locks";
import type { NotificationEvents, NotificationChange } from "./notification.events";
import type {
  NotificationOutboxRepository,
  NotificationEvent,
} from "./notification-outbox.repository";
import { NotificationSourceService } from "./notification-source.service";

export class NotificationWorker {
  /** Consumer giới hạn phạm vi, không đưa nghiệp vụ Notification vào Chat/Listing. */
  constructor(
    private readonly repository: NotificationOutboxRepository,
    private readonly events: NotificationEvents,
    private readonly sources = new NotificationSourceService(repository),
  ) {}

  /** Một claim được commit cùng Notification/receipt, chỉ emit sau persistence thành công. */
  async runOnce(): Promise<boolean> {
    const event = await this.repository.claim();
    if (!event) return false;
    try {
      const changes = await this.process(event);
      await Promise.all(changes.map((change) => this.events.changed(change)));
    } catch {
      await this.repository.fail(event);
    }
    return true;
  }

  /** Khóa User trước recipient; nạp lại intents sau khóa chống race account cleanup/Block. */
  private process(event: NotificationEvent): Promise<NotificationChange[]> {
    return this.repository.db.$transaction(async (tx) => {
      const candidates = await this.sources.intents(event, tx);
      await lockResources(
        tx,
        candidates.flatMap((intent) => [`user:${intent.actorId}`, `user:${intent.recipientId}`]),
      );
      await lockResources(
        tx,
        candidates.map((intent) => `notification:${intent.recipientId}`),
      );
      const processed = await tx.processedEvent.findUnique({
        where: { consumerName_eventId: { consumerName: "notification", eventId: event.id } },
      });
      const changes: NotificationChange[] = [];
      if (!processed) {
        const intents = await this.sources.intents(event, tx);
        for (const intent of intents) {
          if (
            !candidates.some(
              (candidate) =>
                candidate.recipientId === intent.recipientId &&
                candidate.actorId === intent.actorId,
            )
          )
            continue;
          if (!(await this.repository.allowed(intent, tx))) continue;
          const id = await this.repository.persist(intent, event, tx);
          if (id) changes.push({ recipientId: intent.recipientId, notificationId: id });
        }
      }
      await this.repository.complete(event, tx);
      return changes;
    });
  }
}
