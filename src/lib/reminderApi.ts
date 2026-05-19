import type { ReminderInput, ReminderUpdate } from "../shared/types";
import type { TempoSettings } from "../shared/types";
import { browserStore } from "./browserStore";

const browserSettings: TempoSettings = {
  markdownDir: null,
  alarmSoundPath: null,
  reminderSoundPath: null,
  alarmVolume: 0.8,
  reminderVolume: 0.8,
};

export const reminderApi = {
  list: () => window.tempo?.reminders.list() ?? browserStore.list(),
  create: (input: ReminderInput) => window.tempo?.reminders.create(input) ?? browserStore.create(input),
  update: (id: string, patch: ReminderUpdate) =>
    window.tempo?.reminders.update(id, patch) ?? browserStore.update(id, patch),
  delete: (id: string) => window.tempo?.reminders.delete(id) ?? browserStore.delete(id),
  testAlarm: (title: string) => window.tempo?.alarms.test(title) ?? Promise.resolve(),
  settings: {
    get: () => window.tempo?.settings.get() ?? Promise.resolve(browserSettings),
    path: () => window.tempo?.settings.path() ?? Promise.resolve("Browser preview storage"),
    update: (patch: Partial<TempoSettings>) => window.tempo?.settings.update(patch) ?? Promise.resolve({ ...browserSettings, ...patch }),
    chooseMarkdownDir: () => window.tempo?.settings.chooseMarkdownDir() ?? Promise.resolve(null),
    chooseSoundFile: () => window.tempo?.settings.chooseSoundFile() ?? Promise.resolve(null),
  },
  files: {
    audioDataUrl: (filePath: string) => window.tempo?.files.audioDataUrl(filePath) ?? Promise.resolve(filePath),
  },
};
