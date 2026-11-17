#!/usr/bin/env node
// College Tracker — tiny zero-dependency local server.
// Serves the app from ./public and saves your data to ./data/tracker.json
// so everything is still there after you close and reopen it.

const http = require("http");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const PORT = Number(process.env.PORT) || 5173;
const HOST = "127.0.0.1"; // only reachable from your own computer
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = process.env.TRACKER_DATA_DIR || path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "tracker.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const MAX_BODY = 10 * 1024 * 1024; // 10 MB

const EMPTY_STATE = {
  version: 1,
  classes: [],
  assignments: [],
  exams: [],
  gpa: { courses: [], priorGpa: "", priorCredits: "" },
  notes: "",
  links: [],
  settings: { alertHours: 48, notifications: false, theme: "auto" },
  pomodoro: { focus: 25, short: 5, long: 15, history: {} },
};

fs.mkdirSync(BACKUP_DIR, { recursive: true });

function readState() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") {
      // Corrupt file: keep a copy so nothing is lost, then start fresh.
      const bad = DATA_FILE + ".corrupt-" + Date.now();
      try { fs.copyFileSync(DATA_FILE, bad); } catch {}
      console.error("Could not read data file, saved a copy to", bad);
    }
    return structuredClone(EMPTY_STATE);
  }
}

function writeState(state) {
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, DATA_FILE); // atomic: never leaves a half-written file
}

// One automatic backup per day, keeping the last 14.
function dailyBackup() {
  if (!fs.existsSync(DATA_FILE)) return;
  const day = new Date().toISOString().slice(0, 10);
  const target = path.join(BACKUP_DIR, `tracker-${day}.json`);
  if (!fs.existsSync(target)) fs.copyFileSync(DATA_FILE, target);
  const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.startsWith("tracker-")).sort();
  while (files.length > 14) fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/data") {
    if (req.method === "GET") return send(res, 200, JSON.stringify(readState()));
    if (req.method === "PUT") {
      let body = "";
      let tooBig = false;
      req.on("data", (chunk) => {
        body += chunk;
        if (body.length > MAX_BODY) { tooBig = true; req.destroy(); }
      });
      req.on("end", () => {
        if (tooBig) return;
        try {
          const state = JSON.parse(body);
          if (typeof state !== "object" || state === null || Array.isArray(state)) throw new Error("bad shape");
          dailyBackup();
          writeState(state);
          send(res, 200, JSON.stringify({ ok: true, savedAt: new Date().toISOString() }));
        } catch (e) {
          send(res, 400, JSON.stringify({ ok: false, error: "Invalid data" }));
        }
      });
      return;
    }
    return send(res, 405, JSON.stringify({ error: "Method not allowed" }));
  }

  // Static files
  let filePath = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(url.pathname)));
  if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, "Forbidden", "text/plain");
  if (url.pathname === "/" || !path.extname(filePath)) filePath = path.join(PUBLIC_DIR, "index.html");
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, "Not found", "text/plain");
    send(res, 200, data, MIME[path.extname(filePath)] || "application/octet-stream");
  });
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.log(`\nPort ${PORT} is already in use — the tracker is probably already running.`);
    console.log(`Open http://localhost:${PORT} or start on another port:  PORT=5174 npm start\n`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, HOST, () => {
  const link = `http://localhost:${PORT}`;
  console.log("\n  🎓 College Tracker is running");
  console.log(`  → ${link}`);
  console.log(`  Data file: ${DATA_FILE}`);
  console.log("  Press Ctrl+C to stop.\n");
  if (!process.env.NO_OPEN && !process.argv.includes("--no-open")) {
    const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start \"\"" : "xdg-open";
    exec(`${cmd} ${link}`, () => {});
  }
});
