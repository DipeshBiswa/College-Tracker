# College Tracker

A calm, simple tracker for college: classes and their assignments, exams, and gentle reminders.
Styled like apple.com in bisque & lavender, with light and dark mode. Runs on your own computer, with no account and no internet needed.

## Features

- **Today**: a short summary of your week, one list of what's due (assignments and exams together), and today's classes.
- **Classes**: each class holds its own assignments. Tick them off with a round checkmark; click one to edit it.
- **Exams**: a countdown to each exam, plus where it is and what's on it.
- **Calendar**: a month view of everything that's due.
- **Reminders**: turn on desktop notifications to get a heads-up before things are due (you choose 12 hours to 1 week ahead). The Today tab shows how many things are coming up soon.
- **Tools**: focus timer, "what do I need on the final?" calculator, GPA calculator, notes, saved links, study tips and helpful sites.
- **Sounds**: soft chimes when you add or finish things (can be turned off in Settings).
- **Your data is saved** to `data/tracker.json` automatically, with a daily backup in `data/backups/` (last 14 kept).
  Close it, restart your computer, open it again, and everything is still there. You can also export or import a backup in **Tools → Settings**.

## Run it

You need [Node.js](https://nodejs.org) 18 or newer. There is nothing else to install.

```bash
git clone https://github.com/DipeshBiswa/college-tracker.git
cd college-tracker
npm start
```

It opens **http://localhost:5173** in your browser. You can also double-click `start.sh` (Mac/Linux) or `start.bat` (Windows).

- Use a different port: `PORT=5174 npm start`
- Don't open the browser automatically: `npm run dev`
- Keep your data somewhere else (for example a Dropbox or iCloud folder, to sync between laptops):
  `TRACKER_DATA_DIR="$HOME/Dropbox/college-tracker" npm start`

### Keyboard shortcuts
`n` new assignment · `e` new exam · `1`–`4` switch tabs · `5` tools

## Privacy

The app only runs on your own computer (`127.0.0.1`), so other devices can't reach it.
The `data/` folder is in `.gitignore`, so your assignments are **not** uploaded to GitHub.
