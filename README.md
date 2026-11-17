# College Tracker

A calm, simple tracker for college: classes and their assignments, exams, and gentle reminders.
Styled like apple.com in bisque & lavender, with light and dark mode. Install it like an app. No account needed, and it works offline.

## Features

- **Today**: a short summary of your week, one list of what's due (assignments and exams together), and today's classes.
- **Classes**: each class holds its own assignments. Tick them off with a round checkmark; click one to edit it.
- **Exams**: a countdown to each exam, plus where it is and what's on it.
- **Calendar**: a month view of everything that's due.
- **Reminders**: turn on desktop notifications to get a heads-up before things are due (you choose 12 hours to 1 week ahead). The Today tab shows how many things are coming up soon.
- **Study music**: calm sounds made right in the app (lo-fi keys, rain, ocean waves, soft pad, brown noise). Mix them, and they work offline. You can also paste a YouTube or Spotify playlist link.
- **Focus timer**: a floating mini timer follows you around the app (pause, reset or hide it while it keeps running), and a loud bell rings when time's up.
- **Tools**: focus timer, "what do I need on the final?" calculator, GPA calculator, notes, saved links, study tips and helpful sites.
- **Sounds**: soft, creamy keyboard clicks when you add or finish things (can be turned off in Settings).
- **Your data is saved** automatically on your device. Close it, restart your computer, open it again, and everything is still there.

## Install it as an app

1. Open **https://dipeshbiswa.github.io/College-Tracker/**
2. Install it:
   - **Chrome / Edge (Mac or Windows):** click **Install app** in the top bar (or the install icon in the address bar).
   - **Safari (Mac):** File menu → **Add to Dock**.
   - **iPhone / iPad:** Share → **Add to Home Screen**.
3. From now on, open **College Tracker** from your Dock, Launchpad, Start menu or desktop, like any other app.
   It opens in its own window and works offline.

Your data is saved on your device inside the app. Use **Tools → Settings → Backup → Export** now and then to keep a copy
(or to move your data to another computer with **Import**).

## Run it from the code instead (optional)

If you'd rather keep your data in a file (`data/tracker.json`, with daily backups), you can run it with [Node.js](https://nodejs.org) 18+:

```bash
git clone https://github.com/DipeshBiswa/College-Tracker.git
cd College-Tracker
npm start
```

It opens at http://localhost:5173. You can also double-click `start.sh` (Mac/Linux) or `start.bat` (Windows).

### Keyboard shortcuts
`n` new assignment · `e` new exam · `1`–`4` switch tabs · `5` tools

## Privacy

Your classes and assignments never leave your device: nothing is sent to a server or uploaded to GitHub.
