# Tempo Forge

An Electron + Vite + React + Tailwind starter for reminders, alarms, and time management.

## Stack

- Desktop: Electron + Vite
- Mobile: Capacitor
- UI: React + Tailwind
- Storage: Markdown reminder files plus a SQLite index powered by `sql.js`

## Project Shape

- `electron/main.ts` starts the desktop app and registers IPC.
- `electron/preload.ts` exposes a small, typed bridge at `window.tempo`.
- `electron/storage/` owns Markdown file persistence and the SQLite index.
- `src/App.tsx` is the first usable reminder dashboard.
- `src/shared/types.ts` contains shared reminder contracts.
- `capacitor.config.ts` prepares the Vite build for mobile wrappers.

## Getting Started

Install Node.js, then run:

```bash
npm install
npm run dev
```

For mobile shell sync:

```bash
npm run cap:sync
```

## Storage Model

Each reminder is written as a Markdown file with frontmatter in Electron's `userData` directory:

```text
tempo-data/
  tempo.sqlite
  reminders/
    <reminder-id>.md
```

SQLite is the fast index for filtering and sorting. It is powered by `sql.js` so the app keeps a real SQLite database file without needing native `node-gyp` builds. Markdown remains the durable, human-readable source for reminder content.

## Next Milestones

- Add a background alarm scheduler that survives app restarts.
- Add recurrence editing with RRULE support.
- Add focus sessions and daily planning views.
- Add import/export for the Markdown reminder folder.
- Add Capacitor notification plugins for iOS and Android.
