import type { ScriptStore, SessionService } from "../auth";
import type { UserService } from "../user";
import { ReminderService } from "./reminder.service";
import { createReminderController } from "./reminder.controller";
import { createReminderRouter } from "./reminder.routes";

/** Lắp ghép Reminder tại composition root, tái sử dụng vòng đời Redis và Auth sẵn có. */
export function createReminderModule(
  users: Pick<UserService, "me">,
  sessions: SessionService,
  store: ScriptStore,
  prefix = "looply:",
) {
  const service = new ReminderService(users, store, prefix);
  return { service, router: createReminderRouter(createReminderController(service), sessions) };
}
