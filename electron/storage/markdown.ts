import matter from "gray-matter";
import fs from "node:fs";
import path from "node:path";
import type { Reminder } from "../../src/shared/types";
import { getDataPaths } from "./paths";

export function reminderMarkdownPath(id: string) {
  return path.join(getDataPaths().reminders, `${id}.md`);
}

export function writeReminderMarkdown(reminder: Reminder) {
  const filePath = reminderMarkdownPath(reminder.id);
  const markdown = matter.stringify(reminder.notes || "", {
    id: reminder.id,
    itemType: reminder.itemType,
    title: reminder.title,
    dueAt: reminder.dueAt,
    repeatRule: reminder.repeatRule,
    priority: reminder.priority,
    status: reminder.status,
    tags: reminder.tags,
    createdAt: reminder.createdAt,
    updatedAt: reminder.updatedAt,
  });

  fs.writeFileSync(filePath, markdown, "utf8");
  return filePath;
}
