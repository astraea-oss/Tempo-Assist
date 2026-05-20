import { addMinutes, format, parseISO } from "date-fns";
import {
  AlarmClock,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Maximize2,
  Minimize2,
  Minus,
  RotateCcw,
  Square,
  Trash2,
  FolderOpen,
  Music,
  Pencil,
  Plus,
  Settings,
  TimerReset,
  X,
  type LucideIcon,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { reminderApi } from "./lib/reminderApi";
import type { Reminder, ReminderItemType, TempoSettings } from "./shared/types";

const navItems: Array<[string, LucideIcon]> = [
  ["Timeline", Bell],
  ["Completed", CheckCircle2],
  ["Calendar", CalendarDays],
  ["Focus", TimerReset],
  ["Settings", Settings],
];

type ViewName = "timeline" | "completed" | "calendar" | "focus" | "settings";
type DuePopup = {
  item: Reminder;
  occurrenceIso: string;
};

const quickOffsets = [
  ["10m", 10],
  ["30m", 30],
  ["1h", 60],
] as const;

const recurrenceOptions = [
  ["none", "No repeat"],
  ["hourly", "Hourly"],
  ["daily", "Daily"],
  ["weekly", "Weekly"],
  ["monthly", "Monthly"],
  ["yearly", "Yearly"],
] as const;

type RecurrenceValue = (typeof recurrenceOptions)[number][0];

function dateValue(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function timeValue(date: Date) {
  return format(date, "HH:mm");
}

function combineDateTime(date: string, time: string) {
  return new Date(`${date}T${time}`).toISOString();
}

function countdownLabel(dueAt: string, now: number) {
  const diff = Math.max(0, parseISO(dueAt).getTime() - now);
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);

  return [days, hours, minutes, seconds].map((value) => value.toString().padStart(2, "0")).join(":");
}

function normalizePathInput(filePath: string | null) {
  if (!filePath) {
    return null;
  }

  let normalized = filePath.trim();
  while (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized || null;
}

function addOccurrence(date: Date, repeatRule: string) {
  const next = new Date(date);
  if (repeatRule === "hourly") {
    next.setHours(next.getHours() + 1);
  } else if (repeatRule === "daily") {
    next.setDate(next.getDate() + 1);
  } else if (repeatRule === "weekly") {
    next.setDate(next.getDate() + 7);
  } else if (repeatRule === "monthly") {
    next.setMonth(next.getMonth() + 1);
  } else if (repeatRule === "yearly") {
    next.setFullYear(next.getFullYear() + 1);
  }
  return next;
}

function nextOccurrence(reminder: Reminder, now: number) {
  let occurrence = parseISO(reminder.dueAt);
  if (!reminder.repeatRule || occurrence.getTime() > now) {
    return occurrence;
  }

  let guard = 0;
  while (occurrence.getTime() <= now && guard < 10_000) {
    occurrence = addOccurrence(occurrence, reminder.repeatRule);
    guard += 1;
  }

  return occurrence;
}

function dueOccurrence(reminder: Reminder, now: number) {
  let occurrence = parseISO(reminder.dueAt);
  if (occurrence.getTime() > now) {
    return null;
  }

  if (!reminder.repeatRule) {
    return occurrence;
  }

  let guard = 0;
  while (guard < 10_000) {
    const next = addOccurrence(occurrence, reminder.repeatRule);
    if (next.getTime() > now) {
      return occurrence;
    }
    occurrence = next;
    guard += 1;
  }

  return occurrence;
}

export function App() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [settings, setSettings] = useState<TempoSettings>({
    markdownDir: null,
    alarmSoundPath: null,
    reminderSoundPath: null,
    alarmVolume: 0.8,
    reminderVolume: 0.8,
  });
  const [settingsPath, setSettingsPath] = useState("");
  const [activeView, setActiveView] = useState<ViewName>("timeline");
  const [itemType, setItemType] = useState<ReminderItemType>("reminder");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(() => dateValue(new Date()));
  const [time, setTime] = useState(() => timeValue(addMinutes(new Date(), 30)));
  const [recurrence, setRecurrence] = useState<RecurrenceValue>("none");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [triggeredIds, setTriggeredIds] = useState<string[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [duePopup, setDuePopup] = useState<DuePopup | null>(null);
  const [compactMode, setCompactMode] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function refresh() {
    setReminders(await reminderApi.list());
  }

  useEffect(() => {
    refresh();
    reminderApi.settings.get().then(setSettings);
    reminderApi.settings.path().then(setSettingsPath);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      const due = reminders
        .filter((item) => item.status === "scheduled" || item.status === "snoozed")
        .map((item) => ({ item, occurrence: dueOccurrence(item, now) }))
        .filter((entry): entry is { item: Reminder; occurrence: Date } => Boolean(entry.occurrence))
        .find(({ item, occurrence }) => !triggeredIds.includes(`${item.id}:${occurrence.toISOString()}`));

      if (due) {
        const key = `${due.item.id}:${due.occurrence.toISOString()}`;
        setTriggeredIds((ids) => [...ids, key]);
        setDuePopup((current) => {
          if (!current) {
            playDueSound(due.item);
            return { item: due.item, occurrenceIso: due.occurrence.toISOString() };
          }
          return current;
        });
      }
    }, 5000);

    return () => window.clearInterval(timer);
  }, [reminders, settings, triggeredIds]);

  const stats = useMemo(() => {
    const active = reminders.filter((item) => item.status === "scheduled" || item.status === "snoozed");
    const upcoming = active
      .map((item) => ({ item, occurrence: nextOccurrence(item, now) }))
      .filter(({ occurrence }) => occurrence.getTime() > now)
      .sort((a, b) => a.occurrence.getTime() - b.occurrence.getTime())
      .slice(0, 3);
    return { upcoming };
  }, [reminders, now]);

  const activeItems = useMemo(
    () => reminders.filter((item) => item.status === "scheduled" || item.status === "snoozed"),
    [reminders],
  );

  const completedItems = useMemo(() => reminders.filter((item) => item.status === "done"), [reminders]);

  function setQuickTime(offset: number | null) {
    const next = offset === null ? new Date(new Date().setHours(21, 0, 0, 0)) : addMinutes(new Date(), offset);
    setDate(dateValue(next));
    setTime(timeValue(next));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      return;
    }

    const payload = {
      itemType,
      title,
      notes,
      dueAt: combineDateTime(date, time),
      repeatRule: recurrence === "none" ? null : recurrence,
      priority: "medium" as const,
      tags: [itemType],
    };

    if (editingId) {
      await reminderApi.update(editingId, payload);
    } else {
      await reminderApi.create(payload);
    }

    resetForm();
    await refresh();
  }

  function resetForm() {
    setEditingId(null);
    setItemType("reminder");
    setTitle("");
    setNotes("");
    setRecurrence("none");
    const next = addMinutes(new Date(), 30);
    setDate(dateValue(next));
    setTime(timeValue(next));
  }

  function edit(reminder: Reminder) {
    const due = parseISO(reminder.dueAt);
    setEditingId(reminder.id);
    setItemType(reminder.itemType);
    setTitle(reminder.title);
    setNotes(reminder.notes);
    setDate(dateValue(due));
    setTime(timeValue(due));
    setRecurrence((reminder.repeatRule as RecurrenceValue | null) ?? "none");
  }

  async function saveSettings(patch: Partial<TempoSettings>) {
    setSettings(await reminderApi.settings.update(patch));
  }

  async function chooseMarkdownDir() {
    const markdownDir = await reminderApi.settings.chooseMarkdownDir();
    if (markdownDir) {
      await saveSettings({ markdownDir });
      await refresh();
    }
  }

  async function chooseSound(setting: "alarmSoundPath" | "reminderSoundPath") {
    const filePath = await reminderApi.settings.chooseSoundFile();
    if (filePath) {
      await saveSettings({ [setting]: normalizePathInput(filePath) });
    }
  }

  async function playDueSound(reminder: Reminder) {
    const soundPath = reminder.itemType === "alarm" ? settings.alarmSoundPath : settings.reminderSoundPath;
    const volume = reminder.itemType === "alarm" ? settings.alarmVolume : settings.reminderVolume;
    await playSound(soundPath, volume);
  }

  async function playSound(soundPath: string | null, volume: number) {
    const normalizedPath = normalizePathInput(soundPath);
    if (!normalizedPath) {
      throw new Error("No audio file path set.");
    }

    const audioUrl = await reminderApi.files.audioDataUrl(normalizedPath);
    const audio = new Audio(audioUrl);
    audio.volume = Math.max(0, Math.min(1, volume));
    audioRef.current?.pause();
    audioRef.current = audio;
    await audio.play();
  }

  async function complete(reminder: Reminder) {
    await reminderApi.update(reminder.id, { status: "done" });
    await refresh();
  }

  async function completeOccurrence(reminder: Reminder, occurrenceIso: string) {
    if (!reminder.repeatRule) {
      await reminderApi.update(reminder.id, { status: "done" });
      await refresh();
      return;
    }

    const next = addOccurrence(parseISO(occurrenceIso), reminder.repeatRule);
    const completed = await reminderApi.create({
      itemType: reminder.itemType,
      title: reminder.title,
      notes: reminder.notes,
      dueAt: occurrenceIso,
      repeatRule: null,
      priority: reminder.priority,
      tags: reminder.tags,
    });

    await reminderApi.update(completed.id, { status: "done" });
    await reminderApi.update(reminder.id, { dueAt: next.toISOString(), status: "scheduled" });
    await refresh();
  }

  async function restore(reminder: Reminder) {
    await reminderApi.update(reminder.id, { status: "scheduled" });
    await refresh();
  }

  async function deleteCompleted(reminder: Reminder) {
    await reminderApi.delete(reminder.id);
    await refresh();
  }

  async function snooze(reminder: Reminder) {
    await reminderApi.update(reminder.id, {
      status: "snoozed",
      dueAt: addMinutes(new Date(), 10).toISOString(),
    });
    await refresh();
  }

  async function acknowledgeDue() {
    if (!duePopup) {
      return;
    }

    await completeOccurrence(duePopup.item, duePopup.occurrenceIso);
    setDuePopup(null);
  }

  async function snoozeDue() {
    if (!duePopup) {
      return;
    }

    await snooze(duePopup.item);
    setDuePopup(null);
  }

  if (compactMode) {
    return (
      <main className="min-h-screen bg-[#080b10] p-2 text-slate-100">
        <CompactView now={now} onExit={() => setCompactMode(false)} upcoming={stats.upcoming} />
        {duePopup ? <DueAlert onOk={acknowledgeDue} onSnooze={snoozeDue} popup={duePopup} /> : null}
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#080b10] text-slate-100">
      <div className="grid min-h-screen grid-cols-[220px_1fr] gap-4 p-4">
        <aside className="flex flex-col justify-between rounded-lg border border-white/10 bg-[#0f141d] p-4">
          <div>
            <div className="flex cursor-move items-center gap-3 [-webkit-app-region:drag]">
              <div className="grid h-10 w-10 place-items-center rounded-md bg-cyan-300 text-slate-950">
                <AlarmClock size={22} />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Tempo Assist</p>
                <h1 className="text-lg font-semibold">Time deck</h1>
              </div>
            </div>

            <nav className="mt-6 space-y-1 [-webkit-app-region:no-drag]">
              <button
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-300 transition hover:bg-white/7 hover:text-white"
                onClick={() => setCompactMode(true)}
                type="button"
              >
                <Minimize2 size={17} />
                <span>Compact</span>
              </button>
              {navItems.map(([label, Icon]) => (
                <button
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition hover:bg-white/7 hover:text-white ${
                    viewForLabel(label) === activeView
                      ? "bg-white/10 text-white"
                      : "text-slate-300"
                  }`}
                  key={label}
                  onClick={() => setActiveView(viewForLabel(label))}
                >
                  <Icon size={17} />
                  <span>{label}</span>
                </button>
              ))}
            </nav>
          </div>

          <div className="space-y-2 [-webkit-app-region:no-drag]">
            {stats.upcoming.length > 0 ? (
              stats.upcoming.map(({ item, occurrence }) => (
                <div className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-center" key={item.id}>
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <p className="mt-0.5 font-mono text-lg font-semibold text-cyan-200">
                    {countdownLabel(occurrence.toISOString(), now)}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-center">
                <p className="truncate text-sm font-medium">Nothing scheduled</p>
              </div>
            )}
          </div>
        </aside>

        <section className="grid min-h-0">
          {activeView === "settings" ? (
            <SettingsPanel
              onChooseMarkdownDir={chooseMarkdownDir}
              onChooseSound={chooseSound}
              onPreviewSound={playSound}
              onSaveSettings={saveSettings}
              settings={settings}
              settingsPath={settingsPath}
            />
          ) : activeView === "completed" ? (
            <section className="rounded-lg border border-white/10 bg-[#0f141d] p-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-cyan-300">Archive</p>
                <h2 className="text-2xl font-semibold">Completed</h2>
              </div>

              <ScheduleList
                emptyText="Completed reminders and alarms will appear here."
                items={completedItems}
                mode="completed"
                onDelete={deleteCompleted}
                onRestore={restore}
              />
            </section>
          ) : activeView === "timeline" ? (
          <div className="grid grid-cols-[minmax(0,1fr)_250px] gap-4">
            <section className="rounded-lg border border-white/10 bg-[#0f141d] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-cyan-300">Schedule</p>
                  <h2 className="text-2xl font-semibold">Reminders & alarms</h2>
                </div>
                <button
                  className="grid h-9 w-9 place-items-center rounded-md bg-white/10 text-cyan-200 hover:bg-white/15"
                  onClick={() => reminderApi.testAlarm("Tempo Assist")}
                  title="Test alarm"
                >
                  <Bell size={17} />
                </button>
              </div>

              <ScheduleList
                emptyText="Add a reminder or alarm to begin."
                items={activeItems}
                mode="active"
                onComplete={complete}
                onEdit={edit}
                onSnooze={snooze}
              />
            </section>

            <div className="grid content-start gap-3">
              <div className="rounded-lg border border-white/10 bg-[#111822] px-4 py-3 text-center">
                <p className="text-lg font-semibold text-slate-100">{format(new Date(now), "d MMMM yyyy")}</p>
                <p className="mt-1 font-mono text-2xl font-semibold text-cyan-200">{format(new Date(now), "HH:mm:ss")}</p>
              </div>

            <form className="rounded-lg border border-white/10 bg-[#111822] p-4" onSubmit={submit}>
              {editingId ? (
                <button className="mb-3 text-xs text-slate-400 hover:text-white" onClick={resetForm} type="button">
                  Cancel edit
                </button>
              ) : null}

              <div className="grid grid-cols-2 gap-2 rounded-md bg-slate-950 p-1">
                {(["reminder", "alarm"] as ReminderItemType[]).map((option) => (
                  <button
                    className={`rounded px-3 py-2 text-sm capitalize ${
                      itemType === option ? "bg-cyan-300 text-slate-950" : "text-slate-400 hover:text-white"
                    }`}
                    key={option}
                    onClick={() => setItemType(option)}
                    type="button"
                  >
                    {option}
                  </button>
                ))}
              </div>

              <label className="mt-4 block text-xs font-medium text-slate-300">
                Title
                <input
                  className="mt-1 w-full rounded-md border-white/10 bg-slate-950 text-sm text-white placeholder:text-slate-600"
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={itemType === "alarm" ? "Wake up" : "Take medication"}
                  value={title}
                />
              </label>

              <div className="mt-3 grid gap-2">
                <label className="block text-xs font-medium text-slate-300">
                  Date
                  <input
                    className="mt-1 w-full rounded-md border-white/10 bg-slate-950 text-sm text-white"
                    onChange={(event) => setDate(event.target.value)}
                    type="date"
                    value={date}
                  />
                </label>
                <label className="block text-xs font-medium text-slate-300">
                  Time
                  <input
                    className="mt-1 w-full rounded-md border-white/10 bg-slate-950 text-sm text-white"
                    onChange={(event) => setTime(event.target.value)}
                    type="time"
                    value={time}
                  />
                </label>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                {quickOffsets.map(([label, offset]) => (
                  <button
                    className="rounded-md border border-white/10 px-2 py-2 text-xs text-slate-300 hover:bg-white/10 hover:text-white"
                    key={label}
                    onClick={() => setQuickTime(offset)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>

              <label className="mt-3 block text-xs font-medium text-slate-300">
                Recurrence
                <select
                  className="mt-1 w-full rounded-md border-white/10 bg-slate-950 text-sm text-white"
                  onChange={(event) => setRecurrence(event.target.value as RecurrenceValue)}
                  value={recurrence}
                >
                  {recurrenceOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="mt-3 block text-xs font-medium text-slate-300">
                Notes
                <textarea
                  className="mt-1 h-20 w-full resize-none rounded-md border-white/10 bg-slate-950 text-sm text-white placeholder:text-slate-600"
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Optional context"
                  value={notes}
                />
              </label>

              <button className="mt-3 flex w-full items-center justify-center gap-2 rounded-md bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-slate-950" type="submit">
                {editingId ? <Pencil size={16} /> : <Plus size={16} />}
                {editingId ? "Save changes" : itemType === "alarm" ? "Add alarm" : "Add reminder"}
              </button>
            </form>
            </div>
          </div>
          ) : (
            <PlaceholderPanel title={activeView === "calendar" ? "Calendar" : "Focus"} />
          )}
        </section>
      </div>
      {duePopup ? <DueAlert onOk={acknowledgeDue} onSnooze={snoozeDue} popup={duePopup} /> : null}
    </main>
  );
}

function viewForLabel(label: string): ViewName {
  if (label === "Calendar") {
    return "calendar";
  }
  if (label === "Focus") {
    return "focus";
  }
  if (label === "Settings") {
    return "settings";
  }
  if (label === "Completed") {
    return "completed";
  }
  return "timeline";
}

function CompactView({
  now,
  onExit,
  upcoming,
}: {
  now: number;
  onExit: () => void;
  upcoming: Array<{ item: Reminder; occurrence: Date }>;
}) {
  return (
    <section className="mx-auto flex min-h-[120px] w-full max-w-[420px] flex-col gap-2">
      <div className="flex cursor-move items-center justify-between gap-2 rounded-md border border-white/10 bg-[#0f141d] px-2 py-1.5 [-webkit-app-region:drag]">
        <div className="flex min-w-0 items-center gap-1.5">
          <AlarmClock className="shrink-0 text-cyan-300" size={14} />
          <span className="truncate text-xs font-semibold uppercase tracking-[0.12em] text-cyan-300">Upcoming</span>
        </div>
        <button
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-white/10 text-slate-300 hover:bg-white/10 [-webkit-app-region:no-drag]"
          onClick={onExit}
          title="Exit compact view"
          type="button"
        >
          <Maximize2 size={15} />
        </button>
      </div>

      {upcoming.length > 0 ? (
        upcoming.map(({ item, occurrence }) => (
          <article
            className="grid min-h-[58px] min-w-0 grid-cols-[38px_minmax(0,1fr)] items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] p-2"
            key={`${item.id}:${occurrence.toISOString()}`}
          >
            <div className="flex h-10 w-[38px] items-center justify-center rounded border border-cyan-300/20 bg-cyan-300/10 text-center text-[10px] font-bold uppercase leading-none text-cyan-100">
              {compactTypeLabel(item.itemType)}
            </div>
            <div className="flex min-w-0 flex-col justify-center overflow-hidden">
              <p className="truncate text-[11px] font-semibold leading-4 text-slate-100">{item.title}</p>
              <p className="truncate font-mono text-[13px] font-semibold leading-4 text-cyan-200">
                {countdownLabel(occurrence.toISOString(), now)}
              </p>
            </div>
          </article>
        ))
      ) : (
        <div className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-center text-xs text-slate-400">
          Nothing scheduled
        </div>
      )}
    </section>
  );
}

function compactTypeLabel(itemType: ReminderItemType) {
  return itemType === "alarm" ? "ALR" : "REM";
}

function PlaceholderPanel({ title }: { title: string }) {
  return (
    <section className="rounded-lg border border-white/10 bg-[#0f141d] p-4">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-cyan-300">{title}</p>
      <h2 className="text-2xl font-semibold">{title}</h2>
      <div className="mt-4 rounded-md border border-dashed border-white/15 p-6 text-sm text-slate-500">
        This view is ready for the next pass.
      </div>
    </section>
  );
}

function DueAlert({
  onOk,
  onSnooze,
  popup,
}: {
  onOk: () => Promise<void>;
  onSnooze: () => Promise<void>;
  popup: DuePopup;
}) {
  const isAlarm = popup.item.itemType === "alarm";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6">
      <div className="w-full max-w-md rounded-lg border border-white/10 bg-[#111822] p-5 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-md bg-cyan-300 text-slate-950">
            {isAlarm ? <AlarmClock size={22} /> : <Bell size={22} />}
          </div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.14em] text-cyan-300">{isAlarm ? "Alarm" : "Reminder"}</p>
            <h2 className="truncate text-xl font-semibold">{popup.item.title}</h2>
          </div>
        </div>
        {popup.item.notes ? <p className="mt-4 text-sm text-slate-300">{popup.item.notes}</p> : null}
        <p className="mt-3 text-xs text-slate-500">{format(parseISO(popup.occurrenceIso), "EEE d MMM, HH:mm")}</p>

        <div className={`mt-5 grid gap-2 ${isAlarm ? "grid-cols-2" : "grid-cols-1"}`}>
          {isAlarm ? (
            <button className="rounded-md bg-amber-300 px-4 py-2.5 text-sm font-semibold text-slate-950" onClick={onSnooze} type="button">
              Snooze
            </button>
          ) : null}
          <button className="rounded-md bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-slate-950" onClick={onOk} type="button">
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

function ScheduleList({
  emptyText,
  items,
  mode,
  onComplete,
  onDelete,
  onEdit,
  onRestore,
  onSnooze,
}: {
  emptyText: string;
  items: Reminder[];
  mode: "active" | "completed";
  onComplete?: (reminder: Reminder) => Promise<void>;
  onDelete?: (reminder: Reminder) => Promise<void>;
  onEdit?: (reminder: Reminder) => void;
  onRestore?: (reminder: Reminder) => Promise<void>;
  onSnooze?: (reminder: Reminder) => Promise<void>;
}) {
  return (
    <div className="mt-4 space-y-2">
      {items.length === 0 ? (
        <div className="rounded-md border border-dashed border-white/15 p-6 text-center text-sm text-slate-500">{emptyText}</div>
      ) : (
        items.map((reminder) => (
          <article
            className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-md border border-white/10 bg-white/[0.035] px-3 py-3"
            key={reminder.id}
          >
            <div className="grid h-10 w-10 place-items-center rounded-md bg-slate-950 text-cyan-200">
              {reminder.itemType === "alarm" ? <AlarmClock size={18} /> : <Bell size={18} />}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded border border-cyan-300/20 bg-cyan-300/10 px-2 py-0.5 text-[11px] font-semibold text-cyan-100">
                  {reminder.itemType}
                </span>
                {reminder.repeatRule ? (
                  <span className="rounded border border-cyan-300/20 bg-cyan-300/10 px-2 py-0.5 text-[11px] font-semibold text-cyan-100">
                    {reminder.repeatRule}
                  </span>
                ) : null}
                <span className="text-xs text-slate-500">{format(parseISO(reminder.dueAt), "EEE d MMM, HH:mm")}</span>
              </div>
              <h3 className="mt-1 truncate text-base font-semibold">{reminder.title}</h3>
              {reminder.notes ? <p className="truncate text-xs text-slate-400">{reminder.notes}</p> : null}
            </div>
            {mode === "active" ? (
              <div className="flex items-center gap-1">
                <button
                  className="grid h-8 w-8 place-items-center rounded-md border border-white/10 text-slate-300 hover:bg-white/10"
                  onClick={() => onSnooze?.(reminder)}
                  title="Snooze 10 minutes"
                >
                  <Clock3 size={16} />
                </button>
                <button
                  className="grid h-8 w-8 place-items-center rounded-md border border-white/10 text-slate-300 hover:bg-white/10"
                  onClick={() => onEdit?.(reminder)}
                  title="Edit"
                >
                  <Pencil size={15} />
                </button>
                <button
                  className="grid h-8 w-8 place-items-center rounded-md bg-emerald-400/15 text-emerald-200 hover:bg-emerald-400/20"
                  onClick={() => onComplete?.(reminder)}
                  title="Complete"
                >
                  <Check size={16} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  className="grid h-8 w-8 place-items-center rounded-md bg-amber-300/15 text-amber-100 hover:bg-amber-300/25"
                  onClick={() => onRestore?.(reminder)}
                  title="Undo complete"
                >
                  <RotateCcw size={15} />
                </button>
                <button
                  className="grid h-8 w-8 place-items-center rounded-md bg-rose-500/15 text-rose-200 hover:bg-rose-500/25"
                  onClick={() => onDelete?.(reminder)}
                  title="Delete this completed instance"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            )}
          </article>
        ))
      )}
    </div>
  );
}

function SettingsPanel({
  onChooseMarkdownDir,
  onChooseSound,
  onPreviewSound,
  onSaveSettings,
  settings,
  settingsPath,
}: {
  onChooseMarkdownDir: () => Promise<void>;
  onChooseSound: (setting: "alarmSoundPath" | "reminderSoundPath") => Promise<void>;
  onPreviewSound: (soundPath: string | null, volume: number) => Promise<void>;
  onSaveSettings: (patch: Partial<TempoSettings>) => Promise<void>;
  settings: TempoSettings;
  settingsPath: string;
}) {
  const [draft, setDraft] = useState(settings);
  const [previewStatus, setPreviewStatus] = useState<string | null>(null);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  async function saveDraft() {
    await onSaveSettings({
      ...draft,
      alarmSoundPath: normalizePathInput(draft.alarmSoundPath),
      reminderSoundPath: normalizePathInput(draft.reminderSoundPath),
      markdownDir: normalizePathInput(draft.markdownDir),
    });
  }

  async function preview(soundPath: string | null, volume: number, label: string) {
    try {
      setPreviewStatus(`Playing ${label}...`);
      await onPreviewSound(normalizePathInput(soundPath), volume);
      setPreviewStatus(`${label} preview started.`);
    } catch (error) {
      setPreviewStatus(error instanceof Error ? error.message : "Preview failed.");
    }
  }

  return (
    <section className="rounded-lg border border-white/10 bg-[#0f141d] p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-cyan-300">Settings</p>
          <h2 className="text-2xl font-semibold">Files & sounds</h2>
          <p className="mt-2 truncate text-xs text-slate-500">{settingsPath}</p>
          {previewStatus ? <p className="mt-2 text-xs text-amber-200">{previewStatus}</p> : null}
        </div>
        <button className="rounded-md bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950" onClick={saveDraft} type="button">
          Save
        </button>
      </div>

      <div className="mt-5 grid max-w-4xl gap-3">
        <SettingRow
          icon={<Music size={18} />}
          label="Alarm MP3"
          onPreview={() => preview(draft.alarmSoundPath, draft.alarmVolume, "alarm")}
          onBrowse={() => onChooseSound("alarmSoundPath")}
          onClear={() => setDraft((current) => ({ ...current, alarmSoundPath: null }))}
          onValueChange={(value) => setDraft((current) => ({ ...current, alarmSoundPath: normalizePathInput(value) }))}
          value={draft.alarmSoundPath}
        />
        <VolumeRow
          label="Alarm volume"
          onValueChange={(value) => setDraft((current) => ({ ...current, alarmVolume: value }))}
          value={draft.alarmVolume}
        />
        <SettingRow
          icon={<Music size={18} />}
          label="Reminder MP3"
          onPreview={() => preview(draft.reminderSoundPath, draft.reminderVolume, "reminder")}
          onBrowse={() => onChooseSound("reminderSoundPath")}
          onClear={() => setDraft((current) => ({ ...current, reminderSoundPath: null }))}
          onValueChange={(value) => setDraft((current) => ({ ...current, reminderSoundPath: normalizePathInput(value) }))}
          value={draft.reminderSoundPath}
        />
        <VolumeRow
          label="Reminder volume"
          onValueChange={(value) => setDraft((current) => ({ ...current, reminderVolume: value }))}
          value={draft.reminderVolume}
        />
        <SettingRow
          icon={<FolderOpen size={18} />}
          label="Markdown folder"
          onBrowse={onChooseMarkdownDir}
          onClear={() => setDraft((current) => ({ ...current, markdownDir: null }))}
          onValueChange={(value) => setDraft((current) => ({ ...current, markdownDir: normalizePathInput(value) }))}
          value={draft.markdownDir}
        />
      </div>
    </section>
  );
}

function SettingRow({
  icon,
  label,
  onBrowse,
  onClear,
  onPreview,
  onValueChange,
  value,
}: {
  icon: ReactNode;
  label: string;
  onBrowse: () => Promise<void>;
  onClear: () => void;
  onPreview?: () => Promise<void>;
  onValueChange: (value: string) => void;
  value: string | null;
}) {
  return (
    <div className="grid grid-cols-[auto_150px_1fr_auto_auto_auto] items-center gap-3 rounded-md border border-white/10 bg-white/[0.035] p-3">
      <div className="grid h-9 w-9 place-items-center rounded-md bg-slate-950 text-cyan-200">{icon}</div>
      <span className="text-sm font-medium text-slate-200">{label}</span>
      <input
        className="min-w-0 rounded-md border-white/10 bg-slate-950 px-3 py-2 text-xs text-slate-300 placeholder:text-slate-600"
        onBlur={(event) => onValueChange(event.target.value.trim())}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
        placeholder="Default"
        value={value ?? ""}
      />
      <button className="rounded-md bg-cyan-300 px-3 py-2 text-xs font-semibold text-slate-950" onClick={onBrowse} type="button">
        Browse
      </button>
      <button
        className="rounded-md border border-cyan-300/30 px-3 py-2 text-xs text-cyan-100 hover:bg-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={!value || !onPreview}
        onClick={onPreview}
        type="button"
      >
        Preview
      </button>
      <button className="rounded-md border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/10" onClick={onClear} type="button">
        Clear
      </button>
    </div>
  );
}

function VolumeRow({
  label,
  onValueChange,
  value,
}: {
  label: string;
  onValueChange: (value: number) => void;
  value: number;
}) {
  return (
    <div className="grid grid-cols-[auto_150px_1fr_54px] items-center gap-3 rounded-md border border-white/10 bg-white/[0.025] p-3">
      <div className="grid h-9 w-9 place-items-center rounded-md bg-slate-950 text-cyan-200">
        <Music size={18} />
      </div>
      <span className="text-sm font-medium text-slate-200">{label}</span>
      <input
        className="accent-cyan-300"
        max={100}
        min={0}
        onChange={(event) => onValueChange(Number(event.target.value) / 100)}
        type="range"
        value={Math.round(value * 100)}
      />
      <span className="text-right font-mono text-xs text-slate-400">{Math.round(value * 100)}%</span>
    </div>
  );
}







