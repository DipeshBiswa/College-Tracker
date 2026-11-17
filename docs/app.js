/* College Tracker — front end (vanilla JS, no build step) */
"use strict";

/* ================= State & persistence ================= */

const DEFAULTS = {
  version: 1,
  classes: [],
  assignments: [],
  exams: [],
  gpa: { courses: [], priorGpa: "", priorCredits: "" },
  notes: "",
  links: [],
  settings: { alertHours: 48, notifications: false, theme: "auto", sounds: true, volume: 60 },
  pomodoro: { focus: 25, short: 5, long: 15, history: {} },
};

let state = structuredClone(DEFAULTS);
// "device": saved inside the installed app on this computer (default).
// "server": saved to data/tracker.json when started with `npm start`.
let storageMode = "device";
let saveTimer = null;
const LOCAL_KEY = "ct-state";

function merge(base, data) {
  const out = { ...base, ...(data || {}) };
  for (const k of ["gpa", "settings", "pomodoro"]) out[k] = { ...base[k], ...((data || {})[k] || {}) };
  for (const k of ["classes", "assignments", "exams", "links"]) if (!Array.isArray(out[k])) out[k] = [];
  if (!Array.isArray(out.gpa.courses)) out.gpa.courses = [];
  return out;
}

const readLocal = () => { try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "null"); } catch { return null; } };
const isEmpty = (d) => !d || (!(d.classes || []).length && !(d.assignments || []).length && !(d.exams || []).length);

async function load() {
  let data = null;
  const local0 = ["localhost", "127.0.0.1"].includes(location.hostname);
  if (local0) try {
    const r = await fetch("api/data", { cache: "no-store" });
    if (r.ok && (r.headers.get("content-type") || "").includes("application/json")) {
      data = await r.json();
      storageMode = "server";
    }
  } catch {}
  const local = readLocal();
  if (storageMode === "device") data = local;
  else if (isEmpty(data) && !isEmpty(local)) { data = local; }
  state = merge(DEFAULTS, data);
  if (storageMode === "server" && data === local && local) save();
  // Ask the browser to never clear this app's data to free up space.
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch {}
}

function save() {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(state)); } catch {}
  if (storageMode !== "server") return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    try {
      await fetch("api/data", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(state) });
    } catch {}
  }, 250);
}

window.addEventListener("beforeunload", () => {
  if (storageMode === "server" && saveTimer) {
    clearTimeout(saveTimer);
    try { fetch("api/data", { method: "PUT", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify(state) }); } catch {}
  }
});

/* ================= Helpers ================= */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DAY = 86400000;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Soft class colors that sit well with bisque & lavender
const COLORS = ["#8676d9", "#e0a46c", "#6fb39a", "#d987a4", "#6f9fd8", "#c9a24f", "#a586d9", "#df8573"];

const pad = (n) => String(n).padStart(2, "0");
const toLocalInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => (s ? new Date(s) : null);
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

function fmtDate(s, opts = {}) {
  const d = parse(s);
  if (!d || isNaN(d)) return "";
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", ...opts });
}
function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function relative(s) {
  const d = parse(s);
  if (!d) return "";
  const diff = d - Date.now();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000), hrs = Math.round(abs / 3600000);
  const days = Math.round((startOfDay(d) - startOfDay(new Date())) / DAY);
  if (diff < 0) {
    if (mins < 60) return `${mins} min overdue`;
    if (hrs < 24) return `${hrs} h overdue`;
    return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
  }
  if (mins < 60) return `in ${mins} min`;
  if (days === 0) return `today, in ${hrs} h`;
  if (days === 1) return "tomorrow";
  if (days < 7) return `in ${days} days`;
  if (days < 14) return "next week";
  return `in ${days} days`;
}

function urgency(s, done) {
  if (done) return "done";
  const d = parse(s);
  if (!d) return "none";
  const diff = d - Date.now();
  if (diff < 0) return "overdue";
  if (diff < state.settings.alertHours * 3600000) return "soon";
  return "later";
}

const classById = (id) => state.classes.find((c) => c.id === id);
const classColor = (id) => classById(id)?.color || "#8676d9";
const className = (id) => { const c = classById(id); return c ? (c.code || c.name) : "No class"; };
const byDue = (a, b) => (a.due || "9999").localeCompare(b.due || "9999");
const byDate = (a, b) => (a.date || "9999").localeCompare(b.date || "9999");

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2600);
}

/* ================= Sound effects: soft "creamy" keyboard keys (synthesized, no files) ================= */

// Each sound is a little sequence of keystrokes: [delay s, pitch Hz of the "thock", brightness of the click, loudness]
const SOUNDS = {
  click:    [[0, 190, 0.9, 0.7]],
  open:     [[0, 200, 1.0, 0.6]],
  add:      [[0, 185, 1.0, 0.8], [0.075, 205, 1.05, 0.7]],
  complete: [[0, 175, 0.95, 0.9], [0.085, 215, 1.1, 0.75]],
  uncheck:  [[0, 160, 0.8, 0.7]],
  delete:   [[0, 120, 0.6, 0.9]],                                    // deeper, like a spacebar
  theme:    [[0, 170, 0.9, 0.7], [0.11, 190, 0.95, 0.6]],
  alert:    [[0, 200, 1.1, 0.9], [0.13, 200, 1.1, 0.8], [0.26, 230, 1.2, 0.85]],
  timer:    [[0, 125, 0.7, 1], [0.22, 125, 0.7, 0.9]],
  button:   "button",                                                // focus timer Start / Pause
  allDone:  [[0, 175, 1, 0.8], [0.06, 190, 1.05, 0.75], [0.12, 205, 1.1, 0.75], [0.18, 225, 1.15, 0.85]],
};

let audioCtx = null, noiseBuf = null;

function keystroke(ctx, out, t, pitch, bright, loud) {
  const vary = 1 + (Math.random() - 0.5) * 0.08;           // tiny variation, like real keys
  // 1) The soft click: a short burst of filtered noise.
  const n = ctx.createBufferSource(); n.buffer = noiseBuf;
  const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2200 * bright * vary; bp.Q.value = 0.9;
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3800;  // keeps it muted, not clacky
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(0.55 * loud, t + 0.0015);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.028);
  n.connect(bp).connect(lp).connect(ng).connect(out);
  n.start(t); n.stop(t + 0.04);
  // 2) The creamy "thock": a low, quickly falling body tone.
  const o = ctx.createOscillator(); o.type = "triangle";
  o.frequency.setValueAtTime(pitch * vary, t);
  o.frequency.exponentialRampToValueAtTime(pitch * 0.55 * vary, t + 0.05);
  const body = ctx.createBiquadFilter(); body.type = "lowpass"; body.frequency.value = 900;
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.0001, t);
  og.gain.exponentialRampToValueAtTime(0.9 * loud, t + 0.003);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.075);
  o.connect(body).connect(og).connect(out);
  o.start(t); o.stop(t + 0.09);
  // 3) A faint bottom-out a few ms later gives that soft, cushioned feel.
  const n2 = ctx.createBufferSource(); n2.buffer = noiseBuf;
  const lp2 = ctx.createBiquadFilter(); lp2.type = "lowpass"; lp2.frequency.value = 1200;
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.0001, t + 0.012);
  g2.gain.exponentialRampToValueAtTime(0.25 * loud, t + 0.014);
  g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
  n2.connect(lp2).connect(g2).connect(out);
  n2.start(t + 0.012); n2.stop(t + 0.05);
}

// Chunky physical-button "click-clack" (press, then release), used for the focus timer Start/Pause.
function buttonPress(ctx, out, t) {
  const part = (at, ring, loud, thud) => {
    // sharp contact click
    const n = ctx.createBufferSource(); n.buffer = noiseBuf;
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 2500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.9 * loud, at + 0.0008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.009);
    n.connect(hp).connect(g).connect(out); n.start(at); n.stop(at + 0.02);
    // plastic body ring
    const n2 = ctx.createBufferSource(); n2.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = ring; bp.Q.value = 9;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.0001, at);
    g2.gain.exponentialRampToValueAtTime(2.2 * loud, at + 0.001);
    g2.gain.exponentialRampToValueAtTime(0.0001, at + 0.035);
    n2.connect(bp).connect(g2).connect(out); n2.start(at); n2.stop(at + 0.05);
    // low thud of the button bottoming out
    if (thud) {
      const o = ctx.createOscillator(); o.type = "sine";
      o.frequency.setValueAtTime(140, at); o.frequency.exponentialRampToValueAtTime(70, at + 0.03);
      const g3 = ctx.createGain();
      g3.gain.setValueAtTime(0.0001, at);
      g3.gain.exponentialRampToValueAtTime(0.7 * loud, at + 0.002);
      g3.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
      o.connect(g3).connect(out); o.start(at); o.stop(at + 0.05);
    }
  };
  part(t, 1650, 1, true);            // press
  part(t + 0.075, 2300, 0.55, false); // release
}

function sfx(name) {
  const s = state.settings;
  if (s.sounds === false) return;
  const keys = SOUNDS[name];
  if (!keys) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    if (!noiseBuf) {
      noiseBuf = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * 0.06), audioCtx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const master = audioCtx.createGain();
    master.gain.value = ((s.volume ?? 60) / 100) * 0.5;
    master.connect(audioCtx.destination);
    const t0 = audioCtx.currentTime + 0.005;
    if (keys === "button") return buttonPress(audioCtx, master, t0);
    for (const [delay, pitch, bright, loud] of keys) keystroke(audioCtx, master, t0 + delay, pitch, bright, loud);
  } catch {}
}

/* ================= Theme ================= */

function applyTheme() {
  const pref = state.settings.theme || "auto";
  const dark = pref === "dark" || (pref === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  $("#themeBtn").textContent = dark ? "☀︎" : "☾";
  $("#themeBtn").title = dark ? "Switch to light mode" : "Switch to dark mode";
  try { localStorage.setItem("ct-theme", pref); } catch {}
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? "#161617" : "#f8f3ec";
}
$("#themeBtn").addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme === "dark";
  state.settings.theme = dark ? "light" : "dark";
  applyTheme();
  sfx("theme");
  save();
  if (currentTab === "tools") renderTools();
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);

/* ================= Tabs ================= */

let currentTab = "dashboard";
function showTab(tab) {
  currentTab = tab;
  $$("#tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  $("#toolsBtn").classList.toggle("active", tab === "tools");
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + tab));
  render();
  try { history.replaceState(null, "", "#" + tab); } catch {}
}
$("#toolsBtn").addEventListener("click", () => { sfx("click"); toolsUi.open = null; showTab("tools"); });
$("#tabs").addEventListener("click", (e) => { const b = e.target.closest("button[data-tab]"); if (b) { sfx("click"); showTab(b.dataset.tab); } });

/* ================= Form dialog ================= */

function openForm({ title, fields, submitLabel = "Save", onSubmit, onDelete }) {
  const dlg = $("#formDialog");
  $("#dialogTitle").textContent = title;
  $("#dialogSubmit").textContent = submitLabel;
  $("#dialogFields").innerHTML = fields.map(fieldHtml).join("");
  const del = $("#dialogDelete");
  del.hidden = !onDelete;
  del.onclick = () => { if (onDelete() !== false) dlg.close(); };
  // color swatches
  $$(".swatch", dlg).forEach((sw) =>
    sw.addEventListener("click", () => {
      const input = $(`input[name="${sw.dataset.for}"]`, dlg);
      input.value = sw.dataset.color;
      $$(`.swatch[data-for="${sw.dataset.for}"]`, dlg).forEach((s) => s.classList.toggle("sel", s === sw));
    })
  );
  const form = $("#dialogForm");
  form.onsubmit = (e) => {
    e.preventDefault();
    const values = {};
    const flatten = (list) => list.flatMap((f) => (f.type === "row" || f.type === "more" ? flatten(f.fields) : [f]));
    const flat = flatten(fields);
    for (const f of flat) {
      if (f.type === "days") values[f.name] = $$(`input[name="${f.name}"]:checked`, dlg).map((i) => Number(i.value));
      else if (f.type === "checkbox") values[f.name] = $(`[name="${f.name}"]`, dlg).checked;
      else values[f.name] = $(`[name="${f.name}"]`, dlg).value.trim();
    }
    if (onSubmit(values) !== false) dlg.close();
  };
  $("#dialogCancel").onclick = () => dlg.close();
  dlg.showModal();
  sfx("open");
  const first = $("input:not([type=hidden]):not([type=checkbox]), select, textarea", dlg);
  if (first) first.focus();
}

function fieldHtml(f) {
  const req = f.required ? "required" : "";
  const val = esc(f.value ?? "");
  let input;
  switch (f.type) {
    case "textarea":
      input = `<textarea name="${f.name}" placeholder="${esc(f.placeholder || "")}" ${req}>${val}</textarea>`; break;
    case "select":
      input = `<select name="${f.name}" ${req}>${f.options.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(f.value ?? "") ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select>`; break;
    case "days":
      input = `<div class="days">${DOW.map((d, i) => `<label><input type="checkbox" name="${f.name}" value="${i}" ${(f.value || []).includes(i) ? "checked" : ""}/><span>${d}</span></label>`).join("")}</div>`; break;
    case "color":
      input = `<div class="swatches">${COLORS.map((c) => `<button type="button" class="swatch ${c === f.value ? "sel" : ""}" data-for="${f.name}" data-color="${c}" style="background:${c}"></button>`).join("")}<input type="color" name="${f.name}" value="${val || COLORS[0]}"/></div>`; break;
    case "checkbox":
      return `<label class="field row" style="justify-content:flex-start;gap:.5rem"><input type="checkbox" class="check" name="${f.name}" ${f.value ? "checked" : ""} style="flex:none"/><span style="margin:0">${esc(f.label)}</span></label>`;
    case "row":
      return `<div class="row">${f.fields.map(fieldHtml).join("")}</div>`;
    case "more":
      return `<details class="more" ${f.open ? "open" : ""}><summary>${esc(f.label || "More options")}</summary>${f.fields.map(fieldHtml).join("")}</details>`;
    default:
      input = `<input type="${f.type || "text"}" name="${f.name}" value="${val}" placeholder="${esc(f.placeholder || "")}" ${req} ${f.step ? `step="${f.step}"` : ""} ${f.min != null ? `min="${f.min}"` : ""} ${f.max != null ? `max="${f.max}"` : ""}/>`;
  }
  return `<label class="field"><span>${esc(f.label)}</span>${input}</label>`;
}

/* ================= CRUD ================= */

function classOptions(includeNone = true) {
  const opts = state.classes.map((c) => ({ value: c.id, label: c.code ? `${c.code} — ${c.name}` : c.name }));
  return includeNone ? [{ value: "", label: "— No class —" }, ...opts] : opts;
}

function editClass(id) {
  const c = classById(id) || {};
  openForm({
    title: id ? "Edit class" : "New class",
    fields: [
      { name: "name", label: "Class name", value: c.name, required: true, placeholder: "Intro to Psychology" },
      { name: "code", label: "Course code (optional)", value: c.code, placeholder: "PSY 101" },
      { name: "days", label: "Meets on", type: "days", value: c.days || [] },
      { type: "row", fields: [
        { name: "start", label: "From", type: "time", value: c.start },
        { name: "end", label: "To", type: "time", value: c.end },
      ] },
      { name: "color", label: "Color", type: "color", value: c.color || COLORS[state.classes.length % COLORS.length] },
      { type: "more", fields: [
        { type: "row", fields: [
          { name: "instructor", label: "Instructor", value: c.instructor, placeholder: "Dr. Rivera" },
          { name: "location", label: "Room", value: c.location, placeholder: "Hall B 204" },
        ] },
        { type: "row", fields: [
          { name: "credits", label: "Credits", type: "number", value: c.credits, min: 0, step: "0.5", placeholder: "3" },
          { name: "officeHours", label: "Office hours", value: c.officeHours, placeholder: "Tue 2–3pm" },
        ] },
      ] },
    ],
    onSubmit: (v) => {
      if (id) Object.assign(c, v);
      else state.classes.push({ id: uid(), ...v, createdAt: Date.now() });
      save(); render(); sfx(id ? "click" : "add"); toast(id ? "Saved" : "Class added");
    },
    onDelete: id ? () => deleteClass(id) : null,
  });
}

function deleteClass(id) {
  const c = classById(id);
  const n = state.assignments.filter((a) => a.classId === id).length;
  if (!confirm(`Delete "${c.name}"${n ? ` and its ${n} assignment${n > 1 ? "s" : ""}` : ""}?`)) return false;
  state.classes = state.classes.filter((x) => x.id !== id);
  state.assignments = state.assignments.filter((a) => a.classId !== id);
  state.exams.forEach((e) => { if (e.classId === id) e.classId = ""; });
  save(); render(); sfx("delete"); toast("Class deleted");
}

function defaultDue() {
  const d = new Date(Date.now() + DAY);
  d.setHours(23, 59, 0, 0);
  return toLocalInput(d);
}

function editAssignment(id, classId, due) {
  const a = state.assignments.find((x) => x.id === id) || {};
  if (!state.classes.length && !id) { toast("Add a class first"); return editClass(); }
  openForm({
    title: id ? "Edit assignment" : "New assignment",
    fields: [
      { name: "title", label: "What's due?", value: a.title, required: true, placeholder: "Lab report #3" },
      { type: "row", fields: [
        { name: "classId", label: "Class", type: "select", options: classOptions(false), value: a.classId || classId || state.classes[0]?.id },
        { name: "due", label: "Due", type: "datetime-local", value: a.due || due || defaultDue(), required: true },
      ] },
      { type: "more", open: !!(a.notes || a.priority === "high"), fields: [
        { name: "priority", label: "Priority", type: "select", value: a.priority || "normal", options: [
          { value: "normal", label: "Normal" }, { value: "high", label: "Important" }] },
        { name: "notes", label: "Notes or link", type: "textarea", value: a.notes, placeholder: "Pages 40–62, submit on Canvas…" },
      ] },
    ],
    onSubmit: (v) => {
      if (id) Object.assign(a, v);
      else state.assignments.push({ id: uid(), ...v, done: false, createdAt: Date.now() });
      save(); render(); sfx(id ? "click" : "add"); toast(id ? "Saved" : "Added");
    },
    onDelete: id ? () => deleteAssignment(id) : null,
  });
}

function toggleAssignment(id) {
  const a = state.assignments.find((x) => x.id === id);
  if (!a) return;
  a.done = !a.done;
  a.doneAt = a.done ? Date.now() : null;
  save();
  if (a.done) {
    const rest = state.assignments.filter((x) => x.classId === a.classId && !x.done);
    if (!rest.length) { sfx("allDone"); toast(`All done in ${className(a.classId)}`); }
    else { sfx("complete"); toast(cheer()); }
  } else sfx("uncheck");
  // let the checkmark animate before the row moves
  setTimeout(render, a.done ? 450 : 0);
}

function deleteAssignment(id) {
  const a = state.assignments.find((x) => x.id === id);
  if (!confirm(`Delete "${a.title}"?`)) return false;
  state.assignments = state.assignments.filter((x) => x.id !== id);
  save(); render(); sfx("delete");
}

function editExam(id) {
  const e = state.exams.find((x) => x.id === id) || {};
  const d = new Date(Date.now() + 7 * DAY); d.setHours(10, 0, 0, 0);
  openForm({
    title: id ? "Edit exam" : "New exam",
    fields: [
      { name: "title", label: "Exam", value: e.title, required: true, placeholder: "Midterm 1" },
      { type: "row", fields: [
        { name: "classId", label: "Class", type: "select", options: classOptions(true), value: e.classId },
        { name: "date", label: "When", type: "datetime-local", value: e.date || toLocalInput(d), required: true },
      ] },
      { type: "more", open: !!(e.topics || e.location), fields: [
        { name: "location", label: "Where", value: e.location, placeholder: "Room 110" },
        { name: "topics", label: "What's on it", type: "textarea", value: e.topics, placeholder: "Chapters 1–5" },
        { name: "score", label: "Score (after the exam)", type: "number", value: e.score, min: 0, step: "0.1", placeholder: "—" },
      ] },
    ],
    onSubmit: (v) => {
      if (id) Object.assign(e, v);
      else state.exams.push({ id: uid(), ...v, createdAt: Date.now() });
      save(); render(); sfx(id ? "click" : "add"); toast(id ? "Saved" : "Exam added");
    },
    onDelete: id ? () => deleteExam(id) : null,
  });
}

function deleteExam(id) {
  const e = state.exams.find((x) => x.id === id);
  if (!confirm(`Delete "${e.title}"?`)) return false;
  state.exams = state.exams.filter((x) => x.id !== id);
  save(); render(); sfx("delete");
}

const CHEERS = ["Nice work", "One less thing", "Done", "Well done", "Lovely"];
const cheer = () => CHEERS[Math.floor(Math.random() * CHEERS.length)];

/* ================= Rendering: shared pieces ================= */

// "Today, 3:00 PM" · "Tomorrow, 11:59 PM" · "Friday, 9:00 AM" · "Nov 26"
function friendlyDue(s) {
  const d = parse(s);
  if (!d) return "";
  const days = Math.round((startOfDay(d) - startOfDay(new Date())) / DAY);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (d < Date.now()) return days === 0 ? `Overdue · ${time}` : days === -1 ? "Overdue · yesterday" : `Overdue · ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Tomorrow, ${time}`;
  if (days < 7) return `${d.toLocaleDateString(undefined, { weekday: "long" })}, ${time}`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function assignmentRow(a, { showClass = true } = {}) {
  const u = urgency(a.due, a.done);
  return `<li class="item ${a.done ? "done" : ""}">
    <input type="checkbox" class="check" style="--c:${esc(classColor(a.classId))}" data-action="toggle" data-id="${a.id}" ${a.done ? "checked" : ""} aria-label="Mark done"/>
    <div class="body" data-action="edit-assignment" data-id="${a.id}">
      <div class="title">${a.priority === "high" && !a.done ? '<span class="imp">!</span>' : ""}${esc(a.title)}</div>
      <div class="meta ${u}">
        ${showClass ? `<span class="dot" style="background:${esc(classColor(a.classId))}"></span><span>${esc(className(a.classId))}</span><span class="sep">·</span>` : ""}
        <span class="when">${esc(friendlyDue(a.due))}</span>
      </div>
    </div>
  </li>`;
}

function linkify(text) {
  return esc(text).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g, "<br>");
}

function daysUntil(s) { return Math.round((startOfDay(parse(s)) - startOfDay(new Date())) / DAY); }
function countdownLabel(s) {
  const d = daysUntil(s);
  return d <= 0 ? "Today" : d === 1 ? "Tomorrow" : `${d} days`;
}

function examRow(e) {
  const past = parse(e.date) < Date.now() - 3 * 3600000;
  const d = daysUntil(e.date);
  return `<li class="item exam-item">
    <span class="exam-mark" style="--c:${esc(classColor(e.classId))}"></span>
    <div class="body" data-action="edit-exam" data-id="${e.id}">
      <div class="title">${esc(e.title)}</div>
      <div class="meta"><span class="dot" style="background:${esc(classColor(e.classId))}"></span><span>${esc(className(e.classId))}</span><span class="sep">·</span>
        <span>${esc(parse(e.date).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }))}</span>
        ${e.location ? `<span class="sep">·</span><span>${esc(e.location)}</span>` : ""}</div>
    </div>
    <span class="pill ${past ? "" : d <= 2 ? "near" : ""}">${past ? (e.score !== "" && e.score != null ? esc(e.score) : "Done") : countdownLabel(e.date)}</span>
  </li>`;
}

function upcomingItems() {
  const items = [
    ...state.assignments.filter((a) => !a.done && a.due).map((a) => ({ kind: "a", when: a.due, ref: a })),
    ...state.exams.filter((e) => e.date && parse(e.date) > Date.now() - 3600000).map((e) => ({ kind: "e", when: e.date, ref: e })),
  ];
  return items.sort((x, y) => x.when.localeCompare(y.when));
}

function alertItems() {
  const limit = Date.now() + state.settings.alertHours * 3600000;
  return upcomingItems().filter((i) => parse(i.when) <= limit);
}

const itemRow = (i) => (i.kind === "a" ? assignmentRow(i.ref) : examRow(i.ref));
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

/* ================= Today ================= */

function renderDashboard() {
  const now = new Date();
  const hr = now.getHours();
  const greet = hr < 5 ? "Good night" : hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";
  const weekEnd = Date.now() + 7 * DAY;
  const items = upcomingItems();
  const soon = items.filter((i) => parse(i.when) <= weekEnd);
  const later = items.filter((i) => parse(i.when) > weekEnd);
  const overdue = soon.filter((i) => i.kind === "a" && parse(i.when) < now).length;
  const dueWeek = soon.filter((i) => i.kind === "a").length - overdue;
  const nextExam = items.find((i) => i.kind === "e");

  let summary;
  if (!state.classes.length) summary = "Let's set things up. Start by adding your classes.";
  else if (!soon.length) summary = "Nothing due this week. Enjoy the calm.";
  else {
    const parts = [];
    if (dueWeek) parts.push(`<b>${plural(dueWeek, "thing")}</b> due this week`);
    if (overdue) parts.push(`<b>${overdue}</b> overdue`);
    summary = parts.length ? `You have ${parts.join(" and ")}.` : "";
    if (nextExam && daysUntil(nextExam.when) <= 14) summary += ` ${esc(nextExam.ref.title)} is ${daysUntil(nextExam.when) <= 0 ? "today" : daysUntil(nextExam.when) === 1 ? "tomorrow" : "in " + daysUntil(nextExam.when) + " days"}.`;
  }

  const todays = state.classes.filter((c) => (c.days || []).includes(now.getDay())).sort((a, b) => (a.start || "").localeCompare(b.start || ""));
  const nowT = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  $("#view-dashboard").innerHTML = `
    <div class="hero">
      <div class="eyebrow">${now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div>
      <h1>${greet}</h1>
      <p class="summary">${summary}</p>
      <div class="hero-actions">
        ${state.classes.length
          ? `<button class="btn primary" data-action="add-assignment">Add assignment</button><button class="btn ghost" data-action="add-exam">Add exam</button>`
          : `<button class="btn primary" data-action="add-class">Add a class</button>`}
      </div>
    </div>

    ${soon.length ? `<div class="section-title">This week</div><div class="card list-card"><ul class="items">${soon.map(itemRow).join("")}</ul></div>` : ""}

    ${later.length ? `<details class="later"><summary>Later <span class="count">${later.length}</span></summary><div class="card list-card"><ul class="items">${later.map(itemRow).join("")}</ul></div></details>` : ""}

    ${todays.length ? `<div class="section-title">Classes today</div><div class="card list-card"><ul class="items">${todays.map((c) => {
      const past = c.end && nowT > c.end;
      const live = c.start && c.end && nowT >= c.start && !past;
      return `<li class="item ${past ? "faded" : ""}"><span class="dot big" style="background:${esc(c.color)}"></span>
        <div class="body"><div class="title">${esc(c.name)}${live ? ' <span class="now">now</span>' : ""}</div>
        <div class="meta">${esc([c.start ? fmtTime(c.start) + (c.end ? " – " + fmtTime(c.end) : "") : "", c.location].filter(Boolean).join(" · "))}</div></div></li>`;
    }).join("")}</ul></div>` : ""}`;
}

/* ================= Classes ================= */

const classUi = { showDone: {} };

function renderClasses() {
  const cards = state.classes.map((c) => {
    const list = state.assignments.filter((a) => a.classId === c.id).sort(byDue);
    const done = list.filter((a) => a.done).length;
    const pct = list.length ? Math.round((done / list.length) * 100) : 0;
    const showDone = classUi.showDone[c.id];
    const pending = list.filter((a) => !a.done);
    const doneList = list.filter((a) => a.done).reverse();
    const sched = (c.days || []).length ? `${c.days.map((d) => DOW[d]).join(", ")}${c.start ? " · " + fmtTime(c.start) : ""}` : "";
    return `<div class="card class-card" style="--c:${esc(c.color)}">
      <div class="class-head" data-action="edit-class" data-id="${c.id}" title="Edit class">
        <span class="list-icon">${esc(initials(c))}</span>
        <div class="grow"><h2>${esc(c.name)}</h2><div class="class-sub">${esc([c.code, sched].filter(Boolean).join(" · ")) || "&nbsp;"}</div></div>
        ${done ? `<span class="ring-pct" style="--p:${pct}" title="${done} of ${list.length} done"></span>` : ""}
      </div>
      ${pending.length ? `<ul class="items">${pending.map((a) => assignmentRow(a, { showClass: false })).join("")}</ul>`
        : list.length ? `<div class="calm-note">All caught up</div>` : ""}
      ${showDone && doneList.length ? `<ul class="items">${doneList.map((a) => assignmentRow(a, { showClass: false })).join("")}</ul>` : ""}
      <div class="class-foot">
        <button class="text-btn" data-action="add-assignment" data-class="${c.id}">+ Add assignment</button>
        ${done ? `<button class="text-btn muted" data-action="toggle-done-view" data-id="${c.id}">${showDone ? "Hide" : "Show"} completed</button>` : ""}
      </div>
    </div>`;
  }).join("");

  $("#view-classes").innerHTML = `
    <div class="page-head"><h1>Classes</h1><button class="btn primary" data-action="add-class">Add class</button></div>
    ${state.classes.length ? `<div class="stack">${cards}</div>`
      : `<div class="card empty">No classes yet.<br><br><button class="btn primary" data-action="add-class">Add your first class</button></div>`}`;
}

function initials(c) {
  const src = (c.code || c.name || "?").replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/);
  if (c.code && src.length >= 2 && /\d/.test(src[1])) return src[0].slice(0, 3).toUpperCase();
  return src.slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

/* ================= Exams ================= */

function renderExams() {
  const cutoff = Date.now() - 3 * 3600000;
  const upcoming = state.exams.filter((e) => parse(e.date) >= cutoff).sort(byDate);
  const past = state.exams.filter((e) => parse(e.date) < cutoff).sort(byDate).reverse();
  $("#view-exams").innerHTML = `
    <div class="page-head"><h1>Exams</h1><button class="btn primary" data-action="add-exam">Add exam</button></div>
    ${upcoming.length ? `<div class="card list-card"><ul class="items">${upcoming.map(examRow).join("")}</ul></div>`
      : `<div class="card empty">No upcoming exams.</div>`}
    ${past.length ? `<details class="later"><summary>Past exams <span class="count">${past.length}</span></summary><div class="card list-card"><ul class="items">${past.map(examRow).join("")}</ul></div></details>` : ""}`;
}

/* ================= Calendar ================= */

const cal = { y: new Date().getFullYear(), m: new Date().getMonth(), sel: dateKey(new Date()) };

function renderCalendar() {
  const first = new Date(cal.y, cal.m, 1);
  const start = new Date(first); start.setDate(1 - first.getDay());
  const todayK = dateKey(new Date());
  const events = {};
  const push = (k, ev) => (events[k] = events[k] || []).push(ev);
  state.assignments.forEach((a) => a.due && push(a.due.slice(0, 10), { t: a.title, c: classColor(a.classId), done: a.done, kind: "a", ref: a }));
  state.exams.forEach((e) => e.date && push(e.date.slice(0, 10), { t: e.title, c: classColor(e.classId), kind: "e", ref: e }));

  let cells = DOW.map((d) => `<div class="cal-dow">${d}</div>`).join("");
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const k = dateKey(d);
    const evs = (events[k] || []).sort((a, b) => (a.kind === "e" ? -1 : 1));
    cells += `<div class="cal-day ${d.getMonth() !== cal.m ? "other" : ""} ${k === todayK ? "today" : ""} ${k === cal.sel ? "sel" : ""}" data-action="cal-select" data-key="${k}">
      <div class="cal-num">${d.getDate()}</div>
      ${evs.slice(0, 3).map((e) => `<div class="cal-ev ${e.done ? "done" : ""}" style="--c:${esc(e.c)}">${esc(e.t)}</div>`).join("")}
      ${evs.length > 3 ? `<div class="cal-more">+${evs.length - 3} more</div>` : ""}
    </div>`;
    if (i >= 34 && d.getMonth() !== cal.m && d.getDay() === 6) break;
  }

  const selEv = events[cal.sel] || [];
  const selDate = new Date(cal.sel + "T00:00");
  const selClasses = state.classes.filter((c) => (c.days || []).includes(selDate.getDay()));

  $("#view-calendar").innerHTML = `
    <div class="card">
      <div class="cal-head">
        <h2>${first.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2>
        <button class="link-btn" data-action="cal-prev" aria-label="Previous month">‹</button>
        <button class="text-btn" data-action="cal-today">Today</button>
        <button class="link-btn" data-action="cal-next" aria-label="Next month">›</button>
      </div>
      <div class="cal-grid">${cells}</div>
    </div>
    <div class="card" style="margin-top:1rem">
      <div class="row" style="justify-content:space-between"><h2 style="margin:0">${selDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</h2>
        <button class="text-btn" data-action="add-assignment-on" data-key="${cal.sel}" style="flex:none">+ Add</button></div>
      ${selClasses.length ? `<div class="small muted" style="margin:.5rem 0">Classes: ${selClasses.map((c) => `<span class="dot" style="background:${esc(c.color)}"></span> ${esc(c.code || c.name)} ${c.start ? fmtTime(c.start) : ""}`).join(" · ")}</div>` : ""}
      ${selEv.length ? `<ul class="items" style="margin-top:.5rem">${selEv.map((e) => (e.kind === "a" ? assignmentRow(e.ref) : examRow(e.ref))).join("")}</ul>`
        : `<div class="muted" style="margin-top:.5rem">Nothing due this day.</div>`}
    </div>`;
}

/* ================= Study music (generated live, works offline) ================= */

const TRACKS = [
  { id: "lofi", name: "Lo-fi keys", sub: "Soft piano chords" },
  { id: "rain", name: "Rain", sub: "Steady and gentle" },
  { id: "waves", name: "Ocean waves", sub: "Slow and rolling" },
  { id: "pad", name: "Soft pad", sub: "Warm ambient hum" },
  { id: "brown", name: "Brown noise", sub: "Deep focus" },
];

const music = { ctx: null, master: null, playing: {}, paused: false, embed: false };

function musicCtx() {
  if (!music.ctx) {
    music.ctx = new (window.AudioContext || window.webkitAudioContext)();
    music.master = music.ctx.createGain();
    music.master.gain.value = musicVol();
    music.master.connect(music.ctx.destination);
  }
  if (music.ctx.state === "suspended" && !music.paused) music.ctx.resume();
  return music.ctx;
}
const musicVol = () => ((state.settings.musicVolume ?? 50) / 100) ** 1.5 * 0.9;

function noiseBuffer(ctx, kind, seconds = 6) {
  const len = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let last = 0, b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === "brown") { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else { b0 = 0.997 * b0 + w * 0.029591; b1 = 0.985 * b1 + w * 0.032534; b2 = 0.95 * b2 + w * 0.048056; d[i] = (b0 + b1 + b2 + w * 0.05) * 0.9; }
    }
  }
  return buf;
}

function loopNoise(ctx, kind) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, kind); src.loop = true;
  return src;
}

function fadeIn(ctx, g, to, secs = 2.5) {
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(to, ctx.currentTime + secs);
}

// Each track builder returns a stop() function.
const TRACK_BUILDERS = {
  brown(ctx, out) {
    const src = loopNoise(ctx, "brown");
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 500;
    const g = ctx.createGain(); fadeIn(ctx, g, 0.55);
    src.connect(lp).connect(g).connect(out); src.start();
    return () => src.stop();
  },

  rain(ctx, out) {
    const src = loopNoise(ctx, "pink");
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 350;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 5200;
    const g = ctx.createGain(); fadeIn(ctx, g, 0.4);
    src.connect(hp).connect(lp).connect(g).connect(out); src.start();
    // occasional soft droplets
    const drops = ctx.createGain(); drops.gain.value = 0.12; drops.connect(out);
    const dropBuf = noiseBuffer(ctx, "pink", 0.05);
    const timer = setInterval(() => {
      const now = ctx.currentTime;
      for (let i = 0; i < 6; i++) {
        if (Math.random() > 0.55) continue;
        const t = now + Math.random() * 0.4;
        const d = ctx.createBufferSource(); d.buffer = dropBuf;
        const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2500 + Math.random() * 3500; bp.Q.value = 6;
        const dg = ctx.createGain();
        dg.gain.setValueAtTime(0.0001, t); dg.gain.exponentialRampToValueAtTime(0.4 + Math.random() * 0.6, t + 0.002);
        dg.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
        d.connect(bp).connect(dg).connect(drops); d.start(t); d.stop(t + 0.05);
      }
    }, 400);
    return () => { clearInterval(timer); src.stop(); };
  },

  waves(ctx, out) {
    const src = loopNoise(ctx, "brown");
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900;
    const swell = ctx.createGain(); swell.gain.value = 0.35;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08;          // one wave every ~12s
    const depth = ctx.createGain(); depth.gain.value = 0.3;
    lfo.connect(depth).connect(swell.gain);
    const cut = ctx.createGain(); cut.gain.value = 500; lfo.connect(cut).connect(lp.frequency);
    const g = ctx.createGain(); fadeIn(ctx, g, 2.4);
    src.connect(lp).connect(swell).connect(g).connect(out); src.start(); lfo.start();
    return () => { src.stop(); lfo.stop(); };
  },

  pad(ctx, out) {
    const chords = [[45, 52, 55, 59, 64], [41, 48, 52, 57, 60], [43, 50, 55, 59, 62], [40, 47, 52, 55, 59]]; // Am9 · Fmaj7 · G6 · Em7
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 700; lp.Q.value = 0.5;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05;
    const lfoG = ctx.createGain(); lfoG.gain.value = 250; lfo.connect(lfoG).connect(lp.frequency); lfo.start();
    const bus = ctx.createGain(); fadeIn(ctx, bus, 0.42, 4); lp.connect(bus).connect(out);
    const voices = [];
    let i = 0;
    const play = () => {
      const t = ctx.currentTime;
      voices.splice(0).forEach(({ o, g }) => { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + 5); o.stop(t + 5.1); });
      for (const m of chords[i++ % chords.length]) for (const det of [-6, 6]) {
        const o = ctx.createOscillator(); o.type = "triangle";
        o.frequency.value = 440 * 2 ** ((m - 69) / 12); o.detune.value = det;
        const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 5);
        o.connect(g).connect(lp); o.start(t); voices.push({ o, g });
      }
    };
    play();
    const timer = setInterval(play, 14000);
    return () => { clearInterval(timer); voices.forEach(({ o }) => { try { o.stop(); } catch {} }); lfo.stop(); };
  },

  lofi(ctx, out) {
    const bpm = 70, beat = 60 / bpm;
    const prog = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]];    // Fmaj7 · Em7 · Dm7 · Cmaj7
    const scale = [72, 74, 76, 79, 81, 84];                                                    // C pentatonic
    const tone = ctx.createBiquadFilter(); tone.type = "lowpass"; tone.frequency.value = 1700;
    const bus = ctx.createGain(); fadeIn(ctx, bus, 0.85, 2); tone.connect(bus).connect(out);
    // gentle tape wobble
    const wob = ctx.createOscillator(); wob.frequency.value = 0.4; const wobG = ctx.createGain(); wobG.gain.value = 6; wob.connect(wobG); wob.start();
    // vinyl crackle
    const crk = ctx.createBufferSource(); const cb = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate); const cd = cb.getChannelData(0);
    for (let i = 0; i < cd.length; i++) cd[i] = Math.random() < 0.0006 ? (Math.random() * 2 - 1) : (Math.random() * 2 - 1) * 0.01;
    crk.buffer = cb; crk.loop = true; const ch = ctx.createBiquadFilter(); ch.type = "highpass"; ch.frequency.value = 1500;
    const cg = ctx.createGain(); cg.gain.value = 0.18; crk.connect(ch).connect(cg).connect(out); crk.start();

    const key = (midi, t, len, vel) => {
      const f = 440 * 2 ** ((midi - 69) / 12);
      const g = ctx.createGain(); g.connect(tone);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + 0.015);
      g.gain.exponentialRampToValueAtTime(vel * 0.35, t + 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      for (const [mult, amp] of [[1, 1], [2, 0.18], [3, 0.05]]) {
        const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = f * mult; wobG.connect(o.detune);
        const a = ctx.createGain(); a.gain.value = amp; o.connect(a).connect(g); o.start(t); o.stop(t + len + 0.05);
      }
    };
    let next = ctx.currentTime + 0.3, step = 0;
    const schedule = () => {
      while (next < ctx.currentTime + 2.5) {
        const bar = Math.floor(step / 8), pos = step % 8;                    // 8 eighth-notes per bar, 1 chord per bar
        const chord = prog[bar % prog.length];
        const swing = pos % 2 ? beat * 0.08 : 0;
        const t = next + swing;
        if (pos === 0) chord.forEach((m, i) => key(m, t + i * 0.012, beat * 3.8, 0.11));
        if (pos === 5) chord.slice(1).forEach((m) => key(m, t, beat * 1.6, 0.06));
        if (pos === 0) key(chord[0] - 12, t, beat * 3.5, 0.12);              // soft bass note
        if (pos !== 0 && Math.random() < 0.22) key(scale[Math.floor(Math.random() * scale.length)], t, beat * 1.4, 0.05);
        next += beat / 2; step++;
      }
    };
    schedule();
    const timer = setInterval(schedule, 250);
    return () => { clearInterval(timer); crk.stop(); wob.stop(); };
  },
};

function toggleTrack(id) {
  const ctx = musicCtx();
  if (music.playing[id]) {
    const stop = music.playing[id]; delete music.playing[id];
    stop();
  } else {
    if (music.paused) { music.paused = false; ctx.resume(); }
    const out = ctx.createGain(); out.connect(music.master);
    const stop = TRACK_BUILDERS[id](ctx, out);
    music.playing[id] = () => {
      const t = ctx.currentTime; out.gain.setValueAtTime(1, t); out.gain.linearRampToValueAtTime(0, t + 1.2);
      setTimeout(() => { try { stop(); } catch {} out.disconnect(); }, 1300);
    };
  }
  sfx("click");
  updateMusicUI();
}

function stopAllMusic() {
  Object.keys(music.playing).forEach((id) => { music.playing[id](); delete music.playing[id]; });
  closeEmbed();
  music.paused = false;
  updateMusicUI();
}

function togglePauseMusic() {
  if (!music.ctx) return;
  music.paused = !music.paused;
  music.paused ? music.ctx.suspend() : music.ctx.resume();
  updateMusicUI();
}

// Your own playlist: YouTube or Spotify link -> embedded player
function embedUrl(link) {
  try {
    const u = new URL(link.trim());
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be") return `https://www.youtube.com/embed/${u.pathname.slice(1)}?autoplay=1`;
    if (host.endsWith("youtube.com")) {
      const list = u.searchParams.get("list"), v = u.searchParams.get("v");
      if (v) return `https://www.youtube.com/embed/${v}?autoplay=1${list ? "&list=" + list : ""}`;
      if (list) return `https://www.youtube.com/embed/videoseries?list=${list}&autoplay=1`;
      const m = u.pathname.match(/\/(?:live|embed|shorts)\/([\w-]+)/);
      if (m) return `https://www.youtube.com/embed/${m[1]}?autoplay=1`;
    }
    if (host === "open.spotify.com") {
      const m = u.pathname.match(/\/(playlist|album|track|episode|show)\/([\w]+)/);
      if (m) return `https://open.spotify.com/embed/${m[1]}/${m[2]}`;
    }
  } catch {}
  return null;
}

function openEmbed() {
  const link = state.settings.musicUrl || "";
  const src = embedUrl(link);
  if (!src) { toast("Paste a YouTube or Spotify link first"); return; }
  const spotify = src.includes("spotify");
  $("#musicEmbed").innerHTML = `<iframe src="${esc(src)}" title="Your playlist" width="100%" height="${spotify ? 152 : 180}" frameborder="0"
    allow="autoplay; clipboard-write; encrypted-media; picture-in-picture" loading="lazy"></iframe>`;
  $("#musicEmbed").hidden = false;
  music.embed = true;
  updateMusicUI();
}
function closeEmbed() { $("#musicEmbed").innerHTML = ""; $("#musicEmbed").hidden = true; music.embed = false; }

function musicStatus() {
  const names = Object.keys(music.playing).map((id) => TRACKS.find((t) => t.id === id).name);
  if (music.embed) names.push("Your playlist");
  return names.length ? `${music.paused ? "Paused" : "Playing"}: ${names.join(" + ")}` : "";
}
function updateMusicUI() {
  const hm = $("#hubMusic"); if (hm) hm.textContent = musicStatus() || "Lo-fi, rain, waves and more";
  const ids = Object.keys(music.playing);
  const names = ids.map((id) => TRACKS.find((t) => t.id === id).name);
  if (music.embed) names.push("Your playlist");
  const dock = $("#musicDock");
  dock.hidden = !names.length;
  $("#musicNow").textContent = names.join(" + ");
  $("#musicPause").textContent = music.paused ? "Play" : "Pause";
  $("#musicPause").hidden = !ids.length;
  $$(".track").forEach((el) => el.classList.toggle("on", !!music.playing[el.dataset.track]));
  const eb = $("#embedBtn"); if (eb) eb.textContent = music.embed ? "Close player" : "Play";
}

$("#musicPause").addEventListener("click", togglePauseMusic);
$("#musicStop").addEventListener("click", stopAllMusic);

/* ================= Student tools ================= */

const GRADE_POINTS = { "A+": 4.0, A: 4.0, "A-": 3.7, "B+": 3.3, B: 3.0, "B-": 2.7, "C+": 2.3, C: 2.0, "C-": 1.7, "D+": 1.3, D: 1.0, "D-": 0.7, F: 0 };

const pomo = { mode: "focus", left: null, running: false, timer: null, count: 0 };

const toolsUi = { open: null };

const TOOL_LIST = [
  { id: "timer", name: "Focus timer", glyph: "◷", tint: "#8676d9" },
  { id: "music", name: "Study music", glyph: "♪", tint: "#d987a4" },
  { id: "final", name: "Final grade calculator", glyph: "%", tint: "#e0a46c" },
  { id: "gpa", name: "GPA calculator", glyph: "A", tint: "#6fb39a" },
  { id: "notes", name: "Notes", glyph: "✎", tint: "#c9a24f" },
  { id: "links", name: "Links & study tips", glyph: "↗", tint: "#6f9fd8" },
];

function toolSubtitle(id) {
  if (id === "timer") return pomo.running ? `<span id="hubTimer">${pomoLabel()}</span> · ${pomo.mode === "focus" ? "focusing" : "on a break"}` : "25-minute focus sessions with breaks";
  if (id === "music") return `<span id="hubMusic">${musicStatus() || "Lo-fi, rain, waves and more"}</span>`;
  if (id === "final") return "What score do I need?";
  if (id === "gpa") return state.gpa.courses.length ? `${plural(state.gpa.courses.length, "course")}` : "Semester and cumulative";
  if (id === "notes") return state.notes ? esc(state.notes.split("\n")[0].slice(0, 48)) : "Jot things down";
  if (id === "links") return "Your links, helpful sites, study tips";
  return "";
}

function openTool(id) { toolsUi.open = id; sfx("click"); renderTools(); window.scrollTo({ top: 0 }); }

function renderTools() {
  const v = $("#view-tools");
  if (!toolsUi.open) {
    v.innerHTML = `
      <div class="page-head"><h1>Tools</h1></div>
      <div class="card list-card menu">
        ${TOOL_LIST.map((t) => `<button class="menu-row" data-action="open-tool" data-tool="${t.id}">
          <span class="menu-ico" style="--c:${t.tint}">${t.glyph}</span>
          <span class="grow"><span class="menu-title">${t.name}</span><span class="menu-sub">${toolSubtitle(t.id)}</span></span>
          <span class="chev">›</span></button>`).join("")}
      </div>
      <div class="card list-card menu" style="margin-top:1rem">
        <button class="menu-row" data-action="open-tool" data-tool="settings">
          <span class="menu-ico" style="--c:#8e8e93">⚙︎</span>
          <span class="grow"><span class="menu-title">Settings</span><span class="menu-sub">Appearance, reminders, sounds, backup</span></span>
          <span class="chev">›</span></button>
      </div>`;
    return;
  }
  const t = TOOL_LIST.find((x) => x.id === toolsUi.open) || { name: "Settings" };
  v.innerHTML = `
    <button class="back-btn" data-action="tools-back">‹ Tools</button>
    <h1 class="tool-title">${t.name}</h1>
    <div class="tool-page">${TOOL_PAGES[toolsUi.open]()}</div>`;
  if (toolsUi.open === "timer") updatePomoDisplay();
  if (toolsUi.open === "final") calcFinal();
  if (toolsUi.open === "gpa") calcGpa();
  if (toolsUi.open === "notes") { const n = $("#quickNotes"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
}

const TOOL_PAGES = {
  timer() {
    const p = state.pomodoro;
    if (pomo.left == null) pomo.left = p[pomo.mode] * 60;
    const todayCount = p.history[dateKey(new Date())] || 0;
    return `<div class="card timer big">
      <div class="mode-pills">
        ${["focus", "short", "long"].map((m) => `<button data-action="pomo-mode" data-mode="${m}" class="${pomo.mode === m ? "active" : ""}">${{ focus: "Focus", short: "Break", long: "Long break" }[m]}</button>`).join("")}
      </div>
      <div class="ring">
        <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="none" stroke="var(--fill-2)" stroke-width="2.5"/>
          <circle id="pomoRing" cx="50" cy="50" r="46" fill="none" stroke="var(--lavender)" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="289" stroke-dashoffset="0"/></svg>
        <div class="time" id="pomoTime">00:00</div>
      </div>
      <div class="row" style="justify-content:center;margin-top:1.4rem">
        <button class="btn primary" data-action="pomo-start" style="flex:none;min-width:7rem" id="pomoStart">${pomo.running ? "Pause" : "Start"}</button>
        <button class="btn ghost" data-action="pomo-reset" style="flex:none">Reset</button>
      </div>
      <div class="small muted" style="margin-top:1rem">${todayCount ? `${plural(todayCount, "session")} today` : "Focus for a while, then take a short break."}</div>
      <details class="mini" style="text-align:center"><summary>Adjust times</summary>
        <div class="row small" style="margin-top:.6rem;max-width:22rem;margin-inline:auto">
          <label>Focus <input type="number" data-pomo="focus" value="${p.focus}" min="1" max="120"/></label>
          <label>Break <input type="number" data-pomo="short" value="${p.short}" min="1" max="60"/></label>
          <label>Long <input type="number" data-pomo="long" value="${p.long}" min="1" max="60"/></label>
        </div>
      </details>
    </div>
    <p class="small muted center">The timer keeps running while you use the rest of the app.</p>`;
  },

  music() {
    return `<div class="card">
      <div class="tracks">${TRACKS.map((t) => `<button class="track ${music.playing[t.id] ? "on" : ""}" data-action="track" data-track="${t.id}">
        <span class="eq"><i></i><i></i><i></i></span><span class="tname">${t.name}</span><span class="tsub">${t.sub}</span></button>`).join("")}</div>
      <div class="setting-row" style="margin-top:.4rem"><span class="lbl muted" style="flex:none">Volume</span>
        <input type="range" id="musicVolume" min="0" max="100" value="${state.settings.musicVolume ?? 50}" style="max-width:260px"/></div>
    </div>
    <div class="section-title">Your own playlist</div>
    <div class="card">
      <div class="row" style="flex-wrap:nowrap">
        <input type="url" id="musicUrl" value="${esc(state.settings.musicUrl || "")}" placeholder="Paste a YouTube or Spotify link"/>
        <button class="btn primary" id="embedBtn" data-action="embed" style="flex:none">${music.embed ? "Close player" : "Play"}</button>
      </div>
      <div class="small muted" style="margin-top:.5rem">Playlists need an internet connection.</div>
    </div>
    <p class="small muted center">Tap a sound to start it; you can mix a few. Music keeps playing while you use the rest of the app.</p>`;
  },

  final() {
    return `<div class="card">
      <label class="field"><span>Current grade in the class (%)</span><input type="number" id="fgCurrent" value="${esc(fg.cur)}" placeholder="84" step="0.1"/></label>
      <div class="row">
        <label class="field"><span>Final exam is worth (%)</span><input type="number" id="fgWeight" value="${esc(fg.w)}" placeholder="30" step="0.1"/></label>
        <label class="field"><span>Grade I want (%)</span><input type="number" id="fgTarget" value="${esc(fg.t)}" placeholder="90" step="0.1"/></label>
      </div>
      <div id="fgResult"></div>
    </div>`;
  },

  gpa() {
    const rows = state.gpa.courses.map((c, i) => `<tr>
      <td><input type="text" data-gpa="${i}" data-f="name" value="${esc(c.name)}" placeholder="Course"/></td>
      <td style="width:5.5rem"><input type="number" data-gpa="${i}" data-f="credits" value="${esc(c.credits)}" min="0" step="0.5" placeholder="Credits"/></td>
      <td style="width:5.5rem"><select data-gpa="${i}" data-f="grade">${Object.keys(GRADE_POINTS).map((g) => `<option ${g === c.grade ? "selected" : ""}>${g}</option>`).join("")}</select></td>
      <td><button class="link-btn" data-action="gpa-remove" data-i="${i}" aria-label="Remove">✕</button></td></tr>`).join("");
    return `<div class="card">
      ${rows ? `<table class="gpa"><tr class="gpa-head"><td>Course</td><td>Credits</td><td>Grade</td><td></td></tr>${rows}</table>` : `<p class="muted" style="margin-top:0">Add your courses and grades to see your GPA.</p>`}
      <div class="row" style="margin:.6rem 0 0">
        <button class="text-btn" data-action="gpa-add" style="flex:none">+ Add course</button>
        ${state.classes.length ? `<button class="text-btn muted" data-action="gpa-import" style="flex:none">Use my classes</button>` : ""}
      </div>
      <div id="gpaResult"></div>
    </div>
    <div class="section-title">Previous semesters (optional)</div>
    <div class="card">
      <div class="row">
        <label class="field" style="margin:0"><span>GPA so far</span><input type="number" id="gpaPrior" value="${esc(state.gpa.priorGpa)}" step="0.01" min="0" max="4" placeholder="3.5"/></label>
        <label class="field" style="margin:0"><span>Credits so far</span><input type="number" id="gpaPriorCr" value="${esc(state.gpa.priorCredits)}" min="0" placeholder="30"/></label>
      </div>
    </div>`;
  },

  notes() {
    return `<div class="card notes-card"><textarea id="quickNotes" class="plain" placeholder="Anything on your mind…">${esc(state.notes)}</textarea></div>
      <p class="small muted center">Saves automatically.</p>`;
  },

  links() {
    return `<div class="section-title" style="margin-top:0">My links</div>
    <div class="card">
      <ul class="resource-list">${state.links.map((l, i) => `<li class="row" style="flex-wrap:nowrap"><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.name)}</a><button class="link-btn" style="flex:none" data-action="link-remove" data-i="${i}" aria-label="Remove">✕</button></li>`).join("") || `<li class="muted small">Save your school portal, Canvas, email, library…</li>`}</ul>
      <button class="text-btn" data-action="link-add">+ Add link</button>
    </div>
    <div class="section-title">Helpful sites</div>
    <div class="card">
      <ul class="resource-list">
        <li><a href="https://www.khanacademy.org" target="_blank" rel="noopener">Khan Academy</a> <span class="muted">· free lessons</span></li>
        <li><a href="https://www.desmos.com/calculator" target="_blank" rel="noopener">Desmos</a> <span class="muted">· graphing calculator</span></li>
        <li><a href="https://owl.purdue.edu" target="_blank" rel="noopener">Purdue OWL</a> <span class="muted">· writing & citations</span></li>
        <li><a href="https://www.zotero.org" target="_blank" rel="noopener">Zotero</a> <span class="muted">· citation manager</span></li>
        <li><a href="https://apps.ankiweb.net" target="_blank" rel="noopener">Anki</a> <span class="muted">· flashcards</span></li>
        <li><a href="https://openstax.org" target="_blank" rel="noopener">OpenStax</a> <span class="muted">· free textbooks</span></li>
        <li><a href="https://scholar.google.com" target="_blank" rel="noopener">Google Scholar</a> <span class="muted">· research papers</span></li>
      </ul>
    </div>
    <div class="section-title">Study tips</div>
    <div class="card">
      <ul class="tips">
        <li>Test yourself instead of rereading. Recall is what makes it stick.</li>
        <li>Review in short sessions spread over days, not one long cram.</li>
        <li>Explain it simply, as if to a friend. The gaps show what to study.</li>
        <li>Sleep before an exam beats an all-nighter.</li>
        <li>Go to office hours early in the semester.</li>
      </ul>
    </div>`;
  },

  settings() {
    const s = state.settings;
    const notifOn = "Notification" in window && Notification.permission === "granted" && s.notifications;
    return `<div class="card settings">
      <div class="setting-row"><span class="lbl">Appearance</span>
        <select id="setTheme" class="compact">${[["auto", "Automatic"], ["light", "Light"], ["dark", "Dark"]].map(([v, l]) => `<option value="${v}" ${s.theme === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="setting-row"><span class="lbl">Remind me</span>
        <select id="setAlert" class="compact">${[[12, "12 hours before"], [24, "1 day before"], [48, "2 days before"], [72, "3 days before"], [168, "1 week before"]].map(([h, l]) => `<option value="${h}" ${s.alertHours === h ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="setting-row"><span class="lbl">Desktop notifications ${s.notifications ? `<button class="text-btn" data-action="test-notif">Test</button>` : ""}</span>
        <label class="switch"><input type="checkbox" id="setNotifs" ${notifOn ? "checked" : ""}/><span></span></label></div>
    </div>
    <div class="section-title">Sounds</div>
    <div class="card settings">
      <div class="setting-row"><span class="lbl">Click sounds</span>
        <label class="switch"><input type="checkbox" id="setSounds" ${s.sounds === false ? "" : "checked"}/><span></span></label></div>
      ${s.sounds === false ? "" : `<div class="setting-row"><span class="lbl muted">Click volume</span><input type="range" id="setVolume" min="0" max="100" value="${s.volume ?? 60}" style="max-width:200px"/></div>`}
    </div>
    <div class="section-title">Your data</div>
    <div class="card settings">
      ${isInstalled() ? "" : `<div class="setting-row"><span class="lbl">Install as an app</span><button class="text-btn" data-action="install-app">${installPrompt ? "Install" : "How?"}</button></div>`}
      <div class="setting-row"><span class="lbl">Backup</span>
        <span class="row" style="flex:none;gap:.4rem"><button class="text-btn" data-action="export">Export</button><label class="text-btn">Import<input type="file" id="importFile" accept=".json,application/json" hidden/></label></span></div>
    </div>
    <p class="small muted center">${storageMode === "server" ? "Saving to data/tracker.json on this computer." : "Your data is saved on this device. Export a backup now and then to keep a copy."}</p>`;
  },
};

const fg = { cur: "", w: "", t: "" };
function calcFinal() {
  if ($("#fgCurrent")) { fg.cur = $("#fgCurrent").value; fg.w = $("#fgWeight").value; fg.t = $("#fgTarget").value; }
  const cur = parseFloat($("#fgCurrent")?.value), w = parseFloat($("#fgWeight")?.value), t = parseFloat($("#fgTarget")?.value);
  const out = $("#fgResult");
  if (!out) return;
  if ([cur, w, t].some(isNaN) || w <= 0 || w > 100) { out.innerHTML = ""; return; }
  const need = (t - cur * (1 - w / 100)) / (w / 100);
  const r = Math.round(need * 10) / 10;
  out.innerHTML = need > 100 ? `<div class="result bad">You'd need ${r}%, which is above 100%. A slightly lower goal might be kinder.</div>`
    : need <= 0 ? `<div class="result good">You've already secured ${t}%.</div>`
    : `<div class="result ${need <= 70 ? "good" : ""}">You need <b>${r}%</b> on the final.</div>`;
}

function calcGpa() {
  const out = $("#gpaResult");
  if (!out) return;
  let pts = 0, cr = 0;
  for (const c of state.gpa.courses) {
    const credits = parseFloat(c.credits);
    if (!credits || !(c.grade in GRADE_POINTS)) continue;
    pts += credits * GRADE_POINTS[c.grade]; cr += credits;
  }
  if (!cr) { out.innerHTML = ""; return; }
  const sem = pts / cr;
  const pg = parseFloat(state.gpa.priorGpa), pc = parseFloat(state.gpa.priorCredits);
  let cum = "";
  if (!isNaN(pg) && pc > 0) cum = ` · Cumulative: <b>${((pg * pc + pts) / (pc + cr)).toFixed(2)}</b>`;
  out.innerHTML = `<div class="result">Semester GPA: <b>${sem.toFixed(2)}</b> (${cr} credits)${cum}</div>`;
}

/* ---- Pomodoro ---- */
const pomoLabel = () => `${pad(Math.floor(pomo.left / 60))}:${pad(pomo.left % 60)}`;
function updatePomoDisplay() {
  const hub = $("#hubTimer"); if (hub) hub.textContent = pomoLabel();
  const el = $("#pomoTime");
  const total = state.pomodoro[pomo.mode] * 60;
  if (pomo.left == null) pomo.left = total;
  const m = Math.floor(pomo.left / 60), s = pomo.left % 60;
  const label = `${pad(m)}:${pad(s)}`;
  if (pomo.running) document.title = `${label} · ${pomo.mode === "focus" ? "Focus" : "Break"} — College Tracker`;
  if (!el) return;
  el.textContent = label;
  const ring = $("#pomoRing");
  if (ring) {
    ring.style.strokeDashoffset = String(289 * (1 - pomo.left / total));
    ring.style.stroke = pomo.mode === "focus" ? "var(--lavender)" : "var(--bisque)";
  }
  const btn = $("#pomoStart");
  if (btn) btn.textContent = pomo.running ? "Pause" : "Start";
}

function pomoTick() {
  pomo.left--;
  if (pomo.left <= 0) {
    chime();
    if (pomo.mode === "focus") {
      const k = dateKey(new Date());
      state.pomodoro.history[k] = (state.pomodoro.history[k] || 0) + 1;
      pomo.count++;
      save();
      notify("Focus session done 🍅", "Nice! Take a break.");
      setPomoMode(pomo.count % 4 === 0 ? "long" : "short", true);
    } else {
      notify("Break's over", "Ready for another focus session?");
      setPomoMode("focus", false);
    }
    if (currentTab === "tools") renderTools();
    return;
  }
  updatePomoDisplay();
}

function setPomoMode(mode, keepRunning) {
  pomo.mode = mode;
  pomo.left = state.pomodoro[mode] * 60;
  if (!keepRunning) stopPomo();
  updatePomoDisplay();
}
function stopPomo() { pomo.running = false; clearInterval(pomo.timer); document.title = "College Tracker"; }

const chime = () => sfx("timer");

/* ================= Alerts & notifications ================= */

function notify(title, body) {
  if (!state.settings.notifications || !("Notification" in window) || Notification.permission !== "granted") return;
  try { new Notification(title, { body, icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%238676d9'/%3E%3Cpath d='M10 16.5l4 4 8-9' fill='none' stroke='white' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E" }); } catch {}
}

function getNotified() { try { return JSON.parse(localStorage.getItem("ct-notified") || "{}"); } catch { return {}; } }
function setNotified(n) { try { localStorage.setItem("ct-notified", JSON.stringify(n)); } catch {} }

let firstAlertCheck = true;
function updateBadge() {
  const count = alertItems().length;
  const badge = $("#bellCount");
  badge.textContent = count > 99 ? "99+" : count;
  badge.hidden = count === 0;
}
function checkAlerts() {
  const items = alertItems();
  updateBadge();

  // Desktop notifications: once when it enters the alert window, once at <2h, once when overdue.
  const notified = getNotified();
  const now = Date.now();
  let fresh = false;
  for (const i of items) {
    const when = parse(i.when);
    const diff = when - now;
    const stage = diff < 0 ? "overdue" : diff < 2 * 3600000 ? "2h" : "window";
    const key = `${i.ref.id}|${i.when}|${stage}`;
    if (notified[key]) continue;
    notified[key] = now;
    if (i.kind === "e" && stage === "overdue") continue;
    fresh = true;
    const what = i.kind === "e" ? "Exam" : "Due";
    const cls = className(i.ref.classId);
    if (stage === "overdue") notify(`Overdue: ${i.ref.title}`, `${cls} · was due ${fmtDate(i.when)}`);
    else notify(`${what} ${relative(i.when)}: ${i.ref.title}`, `${cls} · ${fmtDate(i.when)}`);
  }
  // prune old keys
  for (const k of Object.keys(notified)) if (now - notified[k] > 30 * DAY) delete notified[k];
  setNotified(notified);
  if (fresh && !firstAlertCheck) sfx("alert");
  firstAlertCheck = false;

}

async function enableNotifications() {
  if (!("Notification" in window)) { toast("This browser doesn't support notifications"); return; }
  const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (perm === "granted") {
    state.settings.notifications = true;
    save(); toast("Reminders on 🔔"); notify("Reminders are on", "You'll get a heads-up before things are due.");
  } else toast("Notifications blocked — you can allow them in your browser's site settings");
  render();
}

/* ================= Event delegation ================= */

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const { action, id } = el.dataset;
  if (el.tagName === "A") e.preventDefault();
  switch (action) {
    case "toggle": return toggleAssignment(id);
    case "add-class": return editClass();
    case "edit-class": return editClass(id);
    case "delete-class": return deleteClass(id);
    case "add-assignment": return editAssignment(null, el.dataset.class);
    case "add-assignment-on": {
      if (!state.classes.length) { toast("Add a class first"); return editClass(); }
      return editAssignment(null, null, `${el.dataset.key}T23:59`);
    }
    case "edit-assignment": return editAssignment(id);
    case "delete-assignment": return deleteAssignment(id);
    case "toggle-done-view": classUi.showDone[id] = !classUi.showDone[id]; return renderClasses();
    case "add-exam": return editExam();
    case "edit-exam": return editExam(id);
    case "delete-exam": return deleteExam(id);
    case "cal-prev": cal.m--; if (cal.m < 0) { cal.m = 11; cal.y--; } return renderCalendar();
    case "cal-next": cal.m++; if (cal.m > 11) { cal.m = 0; cal.y++; } return renderCalendar();
    case "cal-today": { const d = new Date(); cal.y = d.getFullYear(); cal.m = d.getMonth(); cal.sel = dateKey(d); return renderCalendar(); }
    case "cal-select": if (e.target.closest(".check, .link-btn")) return; cal.sel = el.dataset.key; return renderCalendar();
    case "enable-notifs": return enableNotifications();
    case "dismiss-notif-banner": state.settings.dismissedNotifBanner = true; save(); return render();
    case "test-notif": notify("Test reminder", "This is what a heads-up looks like."); return;
    case "pomo-mode": return setPomoMode(el.dataset.mode, false);
    case "pomo-start":
      if (pomo.running) stopPomo();
      else { pomo.running = true; pomo.timer = setInterval(pomoTick, 1000); }
      sfx("button");
      if (currentTab === "tools" && !toolsUi.open) renderTools();
      return updatePomoDisplay();
    case "pomo-reset": return setPomoMode(pomo.mode, false);
    case "gpa-add": state.gpa.courses.push({ name: "", credits: "3", grade: "A" }); save(); return renderTools();
    case "gpa-remove": state.gpa.courses.splice(Number(el.dataset.i), 1); save(); return renderTools();
    case "gpa-import":
      for (const c of state.classes) if (!state.gpa.courses.some((g) => g.name === (c.code || c.name)))
        state.gpa.courses.push({ name: c.code || c.name, credits: c.credits || "3", grade: "A" });
      save(); return renderTools();
    case "link-add":
      return openForm({
        title: "Add a link",
        fields: [{ name: "name", label: "Name", required: true, placeholder: "Canvas" }, { name: "url", label: "URL", type: "url", required: true, placeholder: "https://…" }],
        onSubmit: (v) => { state.links.push(v); save(); renderTools(); },
      });
    case "link-remove": state.links.splice(Number(el.dataset.i), 1); save(); return renderTools();
    case "export": return exportData();
    case "open-tool": return openTool(el.dataset.tool);
    case "tools-back": toolsUi.open = null; sfx("click"); return renderTools();
    case "track": return toggleTrack(el.dataset.track);
    case "embed": return music.embed ? (closeEmbed(), updateMusicUI()) : openEmbed();
    case "install-app": return installApp();
    case "toggle-sounds": state.settings.sounds = state.settings.sounds === false; save(); renderTools(); return sfx("complete");
    case "preview-sound": { const names = ["complete", "add", "alert", "timer", "allDone"]; return sfx(names[Math.floor(Math.random() * names.length)]); }
  }
});

document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.id === "fgCurrent" || t.id === "fgWeight" || t.id === "fgTarget") return calcFinal();
  if (t.dataset.gpa != null) { state.gpa.courses[Number(t.dataset.gpa)][t.dataset.f] = t.value; save(); return calcGpa(); }
  if (t.id === "gpaPrior") { state.gpa.priorGpa = t.value; save(); return calcGpa(); }
  if (t.id === "gpaPriorCr") { state.gpa.priorCredits = t.value; save(); return calcGpa(); }
  if (t.id === "quickNotes") { state.notes = t.value; return save(); }
  if (t.id === "musicVolume") { state.settings.musicVolume = Number(t.value); if (music.master) music.master.gain.setTargetAtTime(musicVol(), music.ctx.currentTime, 0.05); return save(); }
  if (t.id === "musicUrl") { state.settings.musicUrl = t.value.trim(); return save(); }
});

document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.dataset.pomo) {
    const v = Math.max(1, Math.min(120, parseInt(t.value) || 1));
    state.pomodoro[t.dataset.pomo] = v; save();
    if (!pomo.running && pomo.mode === t.dataset.pomo) { pomo.left = v * 60; updatePomoDisplay(); }
  }
  if (t.id === "setSounds") { state.settings.sounds = t.checked; save(); if (t.checked) sfx("complete"); renderTools(); }
  if (t.id === "setNotifs") { if (t.checked) enableNotifications(); else { state.settings.notifications = false; save(); renderTools(); } }
  if (t.id === "setVolume") { state.settings.volume = Number(t.value); save(); sfx("complete"); }
  if (t.id === "setAlert") { state.settings.alertHours = Number(t.value); save(); checkAlerts(); }
  if (t.id === "setTheme") { state.settings.theme = t.value; save(); applyTheme(); }
  if (t.id === "importFile" && t.files[0]) importData(t.files[0]);
});

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `college-tracker-backup-${dateKey(new Date())}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importData(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      if (!data || typeof data !== "object" || !Array.isArray(data.classes)) throw new Error();
      if (!confirm("Replace all current data with this backup?")) return;
      state = merge(DEFAULTS, data);
      save(); applyTheme(); render(); checkAlerts(); toast("Backup imported ✓");
    } catch { toast("That file isn't a College Tracker backup"); }
  };
  r.readAsText(file);
}

// Keyboard shortcuts: n = new assignment, e = new exam, 1-5 = tabs
document.addEventListener("keydown", (e) => {
  if (e.target.closest("input, textarea, select, dialog") || e.metaKey || e.ctrlKey || e.altKey) return;
  const tabs = ["dashboard", "classes", "exams", "calendar", "tools"];
  if (e.key >= "1" && e.key <= "5") showTab(tabs[Number(e.key) - 1]);
  else if (e.key === "n") { e.preventDefault(); editAssignment(); }
  else if (e.key === "e") { e.preventDefault(); editExam(); }
});

/* ================= Install as an app ================= */

let installPrompt = null;
const isInstalled = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e;
  if (!isInstalled()) $("#installBtn").hidden = false;
  if (currentTab === "tools") renderTools();
});
window.addEventListener("appinstalled", () => {
  installPrompt = null;
  $("#installBtn").hidden = true;
  toast("Installed. Open College Tracker from your apps");
});
async function installApp() {
  if (installPrompt) {
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") { installPrompt = null; $("#installBtn").hidden = true; }
    return;
  }
  toast(installHint());
}
function installHint() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return "Tap Share, then 'Add to Home Screen'";
  if (/Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua)) return "In Safari: File menu, then 'Add to Dock'";
  return "Use the install icon in your browser's address bar";
}
$("#installBtn").addEventListener("click", installApp);

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

/* ================= Main ================= */

function render() {
  if (typeof firstAlertCheck !== "undefined") updateBadge();
  ({ dashboard: renderDashboard, classes: renderClasses, exams: renderExams, calendar: renderCalendar, tools: renderTools })[currentTab]();
}

(async function init() {
  await load();
  applyTheme();
  const hash = location.hash.slice(1);
  if (["dashboard", "classes", "exams", "calendar", "tools"].includes(hash)) currentTab = hash;
  showTab(currentTab);
  checkAlerts();
  setInterval(checkAlerts, 60000);
  // Refresh relative times every minute (skip while typing in tools).
  setInterval(() => { if (currentTab !== "tools" && !$("#formDialog").open) render(); }, 60000);
})();
