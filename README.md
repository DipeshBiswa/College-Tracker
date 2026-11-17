# 🎓 College Tracker

A calm, local-first tracker for college: classes → assignments, exams, deadline reminders, and handy student tools.
Bisque & lavender theme with **light and dark mode**. Runs on your own computer, no account, no internet needed.

## Features

- **Classes** — name, code, credits, instructor, room, meeting days/times, office hours, color.
  Each class card holds its own **assignments** (due date, priority, type, notes/links) with a progress bar.
- **Exams** — date, location, topics, weight, score afterwards, "I'm ready" flag, day countdowns and study nudges.
- **Dashboard** — overdue / this week / upcoming exams at a glance, today's class schedule, grouped "coming up" list.
- **Reminders** — 🔔 bell shows everything due within your alert window (12h → 1 week).
  Turn on **desktop notifications** to get a pop-up when something enters the window, at under 2 hours, and when it's overdue.
- **Calendar** — month view of all assignments and exams, click a day for details.
- **Sound effects** — soft synthesized chimes for completing, adding, deleting, reminders and the focus timer (toggle + volume in Settings).
- **Student tools** — Pomodoro focus timer (tracks sessions), "what do I need on the final?" calculator,
  GPA calculator (semester + cumulative), quick notes, saved links, study tips, free resources.
- **Your data is saved** to `data/tracker.json` automatically (plus daily backups in `data/backups/`, last 14 kept).
  Close it, reboot, reopen — it's all still there. Export/import a backup from *Student Tools → Settings*.

## Run it

Needs [Node.js](https://nodejs.org) 18 or newer. No `npm install` — there are zero dependencies.

```bash
git clone https://github.com/<you>/college-tracker.git
cd college-tracker
npm start
```

It opens **http://localhost:5173** in your browser. Or double-click `start.sh` (Mac/Linux) / `start.bat` (Windows).

- Different port: `PORT=5174 npm start`
- Don't auto-open the browser: `npm run dev`
- Keep data somewhere else (e.g. a Dropbox/iCloud folder to sync between laptops):
  `TRACKER_DATA_DIR="$HOME/Dropbox/college-tracker" npm start`

### Keyboard shortcuts
`n` new assignment · `e` new exam · `1`–`5` switch tabs

## Privacy

The server only listens on `127.0.0.1`, so nothing is reachable from other devices.
`data/` is in `.gitignore`, so your personal assignments are **not** pushed to GitHub.
