import { app } from "electron";
import fs from "node:fs";
import matter from "gray-matter";
import path from "node:path";
import type { TempoSettings } from "../../src/shared/types";

const defaultSettings: TempoSettings = {
  markdownDir: null,
  alarmSoundPath: null,
  reminderSoundPath: null,
  alarmVolume: 0.8,
  reminderVolume: 0.8,
};

function settingsPath() {
  const root = path.join(app.getPath("userData"), "tempo-data");
  fs.mkdirSync(root, { recursive: true });
  return path.join(root, "settings.md");
}

export function getSettings(): TempoSettings {
  const filePath = settingsPath();
  if (!fs.existsSync(filePath)) {
    return defaultSettings;
  }

  return {
    ...defaultSettings,
    ...(matter(fs.readFileSync(filePath, "utf8")).data as Partial<TempoSettings>),
  };
}

export function updateSettings(patch: Partial<TempoSettings>): TempoSettings {
  const settings = { ...getSettings(), ...patch };
  fs.writeFileSync(
    settingsPath(),
    matter.stringify("Edit these values directly if you prefer.\n", settings),
    "utf8",
  );
  return settings;
}

export function getSettingsPath() {
  return settingsPath();
}
