import { randomUUID } from "node:crypto";
import fs from "node:fs";
import type { QueryExecResult } from "sql.js";
import type { Reminder, ReminderInput, ReminderUpdate } from "../../src/shared/types";
import { getDatabase, persistDatabase } from "./database";
import { writeReminderMarkdown } from "./markdown";

const reminderColumns =
  "id, item_type as itemType, title, notes, due_at as dueAt, repeat_rule as repeatRule, priority, status, tags, markdown_path as markdownPath, created_at as createdAt, updated_at as updatedAt";

type ReminderIndexRow = Omit<Reminder, "tags"> & { tags: string };

function deserialize(row: ReminderIndexRow): Reminder {
  return {
    ...row,
    tags: JSON.parse(row.tags || "[]") as string[],
  };
}

function rowsFromResult(result: QueryExecResult[]) {
  return result[0]
    ? result[0].values.map((values) =>
        Object.fromEntries(result[0].columns.map((column, index) => [column, values[index]])),
      )
    : [];
}

export async function listReminders(): Promise<Reminder[]> {
  const database = await getDatabase();
  const result = database.exec(`SELECT ${reminderColumns} FROM reminders ORDER BY due_at ASC`);
  const rows = rowsFromResult(result) as unknown as ReminderIndexRow[];

  return rows.map(deserialize);
}

export async function createReminder(input: ReminderInput): Promise<Reminder> {
  const now = new Date().toISOString();
  const reminder: Reminder = {
    id: randomUUID(),
    itemType: input.itemType,
    title: input.title.trim(),
    notes: input.notes?.trim() ?? "",
    dueAt: input.dueAt,
    repeatRule: input.repeatRule ?? null,
    priority: input.priority,
    status: "scheduled",
    tags: input.tags ?? [],
    markdownPath: "",
    createdAt: now,
    updatedAt: now,
  };

  reminder.markdownPath = writeReminderMarkdown(reminder);

  const database = await getDatabase();
  database.run(
    `INSERT INTO reminders
      (id, item_type, title, notes, due_at, repeat_rule, priority, status, tags, markdown_path, created_at, updated_at)
     VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      reminder.id,
      reminder.itemType,
      reminder.title,
      reminder.notes,
      reminder.dueAt,
      reminder.repeatRule,
      reminder.priority,
      reminder.status,
      JSON.stringify(reminder.tags),
      reminder.markdownPath,
      reminder.createdAt,
      reminder.updatedAt,
    ],
  );
  await persistDatabase();

  return reminder;
}

export async function updateReminder(id: string, patch: ReminderUpdate): Promise<Reminder> {
  const database = await getDatabase();
  const result = database.exec(`SELECT ${reminderColumns} FROM reminders WHERE id = $id`, { $id: id });
  const existing = rowsFromResult(result)[0] as unknown as ReminderIndexRow | undefined;

  if (!existing) {
    throw new Error(`Reminder not found: ${id}`);
  }

  const reminder: Reminder = {
    ...deserialize(existing),
    ...patch,
    id,
    updatedAt: new Date().toISOString(),
  };

  reminder.markdownPath = writeReminderMarkdown(reminder);

  database.run(
    `UPDATE reminders SET
      title = ?,
      item_type = ?,
      notes = ?,
      due_at = ?,
      repeat_rule = ?,
      priority = ?,
      status = ?,
      tags = ?,
      markdown_path = ?,
      updated_at = ?
     WHERE id = ?`,
    [
      reminder.title,
      reminder.itemType,
      reminder.notes,
      reminder.dueAt,
      reminder.repeatRule,
      reminder.priority,
      reminder.status,
      JSON.stringify(reminder.tags),
      reminder.markdownPath,
      reminder.updatedAt,
      reminder.id,
    ],
  );
  await persistDatabase();

  return reminder;
}

export async function deleteReminder(id: string): Promise<void> {
  const database = await getDatabase();
  const result = database.exec(`SELECT ${reminderColumns} FROM reminders WHERE id = $id`, { $id: id });
  const existing = rowsFromResult(result)[0] as unknown as ReminderIndexRow | undefined;

  if (!existing) {
    return;
  }

  const reminder = deserialize(existing);
  database.run("DELETE FROM reminders WHERE id = ?", [id]);
  if (reminder.markdownPath) {
    fs.rmSync(reminder.markdownPath, { force: true });
  }
  await persistDatabase();
}
