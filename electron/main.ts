import { app, BrowserWindow, dialog, ipcMain, Notification } from "electron";
import path from "node:path";
import fs from "node:fs";
import { createReminder, deleteReminder, listReminders, updateReminder } from "./storage/reminders";
import { getSettings, getSettingsPath, updateSettings } from "./storage/settings";
import type { ReminderInput, ReminderUpdate, TempoSettings } from "../src/shared/types";

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    title: "Tempo Forge",
    backgroundColor: "#f4f1ea",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    window.loadFile(path.join(__dirname, "../../dist/index.html"));
  }
}

function registerIpc() {
  ipcMain.handle("reminders:list", () => listReminders());
  ipcMain.handle("reminders:create", (_event, input: ReminderInput) => createReminder(input));
  ipcMain.handle("reminders:update", (_event, id: string, patch: ReminderUpdate) => updateReminder(id, patch));
  ipcMain.handle("reminders:delete", (_event, id: string) => deleteReminder(id));
  ipcMain.handle("settings:get", () => getSettings());
  ipcMain.handle("settings:path", () => getSettingsPath());
  ipcMain.handle("settings:update", (_event, patch: Partial<TempoSettings>) => updateSettings(patch));
  ipcMain.handle("settings:chooseMarkdownDir", async () => {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const options = {
      title: "Choose markdown folder",
      properties: ["openDirectory"] as Electron.OpenDialogOptions["properties"],
    };
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle("settings:chooseSoundFile", async () => {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const options = {
      title: "Choose MP3 sound",
      filters: [{ name: "MP3 audio", extensions: ["mp3"] }],
      properties: ["openFile"] as Electron.OpenDialogOptions["properties"],
    };
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle("files:audioDataUrl", (_event, filePath: string) => {
    const normalized = normalizePathInput(filePath);
    if (!fs.existsSync(normalized)) {
      throw new Error(`File does not exist: ${normalized}`);
    }
    if (path.extname(normalized).toLowerCase() !== ".mp3") {
      throw new Error(`Only .mp3 files are supported right now: ${normalized}`);
    }

    const audio = fs.readFileSync(normalized);
    return `data:audio/mpeg;base64,${audio.toString("base64")}`;
  });
  ipcMain.handle("alarms:test", (_event, title: string) => {
    new Notification({
      title,
      body: "Your reminder alarm pipeline is wired up.",
    }).show();
  });
}

function normalizePathInput(filePath: string) {
  let normalized = filePath.trim();
  while (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized;
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
