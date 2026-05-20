import { contextBridge, ipcRenderer } from "electron";
import type { Reminder, ReminderInput, ReminderUpdate, TempoSettings } from "../src/shared/types";

const api = {
  reminders: {
    list: () => ipcRenderer.invoke("reminders:list") as Promise<Reminder[]>,
    create: (input: ReminderInput) => ipcRenderer.invoke("reminders:create", input) as Promise<Reminder>,
    update: (id: string, patch: ReminderUpdate) =>
      ipcRenderer.invoke("reminders:update", id, patch) as Promise<Reminder>,
    delete: (id: string) => ipcRenderer.invoke("reminders:delete", id) as Promise<void>,
  },
  alarms: {
    test: (title: string) => ipcRenderer.invoke("alarms:test", title) as Promise<void>,
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get") as Promise<TempoSettings>,
    path: () => ipcRenderer.invoke("settings:path") as Promise<string>,
    update: (patch: Partial<TempoSettings>) => ipcRenderer.invoke("settings:update", patch) as Promise<TempoSettings>,
    chooseMarkdownDir: () => ipcRenderer.invoke("settings:chooseMarkdownDir") as Promise<string | null>,
    chooseSoundFile: () => ipcRenderer.invoke("settings:chooseSoundFile") as Promise<string | null>,
  },
  files: {
    audioDataUrl: (filePath: string) => ipcRenderer.invoke("files:audioDataUrl", filePath) as Promise<string>,
  },
  windowControls: {
    minimize: () => ipcRenderer.invoke("window:minimize") as Promise<void>,
    toggleMaximize: () => ipcRenderer.invoke("window:toggleMaximize") as Promise<void>,
    close: () => ipcRenderer.invoke("window:close") as Promise<void>,
  },
};

contextBridge.exposeInMainWorld("tempo", api);

export type TempoApi = typeof api;

