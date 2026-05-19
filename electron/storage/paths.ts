import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { getSettings } from "./settings";

export function getDataPaths() {
  const root = path.join(app.getPath("userData"), "tempo-data");
  const settings = getSettings();
  const reminders = settings.markdownDir || path.join(root, "reminders");
  const db = path.join(root, "tempo.sqlite");

  fs.mkdirSync(reminders, { recursive: true });

  return { root, reminders, db };
}
