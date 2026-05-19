import type { Reminder, ReminderInput, ReminderUpdate } from "../shared/types";

const storageKey = "tempo-forge-reminders";

function read(): Reminder[] {
  return JSON.parse(localStorage.getItem(storageKey) ?? "[]") as Reminder[];
}

function write(reminders: Reminder[]) {
  localStorage.setItem(storageKey, JSON.stringify(reminders));
}

export const browserStore = {
  async list() {
    return read().sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  },
  async create(input: ReminderInput) {
    const now = new Date().toISOString();
    const reminder: Reminder = {
      id: crypto.randomUUID(),
      itemType: input.itemType,
      title: input.title,
      notes: input.notes ?? "",
      dueAt: input.dueAt,
      repeatRule: input.repeatRule ?? null,
      priority: input.priority,
      status: "scheduled",
      tags: input.tags ?? [],
      markdownPath: "",
      createdAt: now,
      updatedAt: now,
    };

    write([...read(), reminder]);
    return reminder;
  },
  async update(id: string, patch: ReminderUpdate) {
    const reminders = read();
    const reminder = reminders.find((item) => item.id === id);
    if (!reminder) {
      throw new Error(`Reminder not found: ${id}`);
    }

    Object.assign(reminder, patch, { updatedAt: new Date().toISOString() });
    write(reminders);
    return reminder;
  },
  async delete(id: string) {
    write(read().filter((item) => item.id !== id));
  },
};
