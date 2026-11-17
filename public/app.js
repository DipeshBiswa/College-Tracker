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
let serverOnline = true;
let saveTimer = null;

function merge(base, data) {
  const out = { ...base, ...(data || {}) };
  for (const k of ["gpa", "settings", "pomodoro"]) out[k] = { ...base[k], ...((data || {})[k] || {}) };
  for (const k of ["classes", "assignments", "exams", "links"]) if (!Array.isArray(out[k])) out[k] = [];
  if (!Array.isArray(out.gpa.courses)) out.gpa.courses = [];
  return out;
}

async function load() {
  let data = null;
  try {
    const r = await fetch("/api/data", { cache: "no-store" });
    if (!r.ok) throw new Error();
    data = await r.json();
  } catch {
    serverOnline = false;
    try { data = JSON.parse(localStorage.getItem("ct-state") || "null"); } catch {}
  }
  // If the server file is empty but the browser has a copy (e.g. server data deleted), recover it.
  const local = (() => { try { return JSON.parse(localStorage.getItem("ct-state") || "null"); } catch { return null; } })();
  const isEmpty = (d) => !d || (!(d.classes || []).length && !(d.assignments || []).length && !(d.exams || []).length);
  if (serverOnline && isEmpty(data) && !isEmpty(local)) { data = local; save(); }
  state = merge(DEFAULTS, data);
}

function save() {
  try { localStorage.setItem("ct-state", JSON.stringify(state)); } catch {}
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const r = await fetch("/api/data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      });
      if (!r.ok) throw new Error();
      if (!serverOnline) toast("Reconnected — saved to disk ✓");
      serverOnline = true;
    } catch {
      if (serverOnline) toast("Server not reachable — saved in this browser for now");
      serverOnline = false;
    }
  }, 250);
}

// Make sure a pending save goes out if the tab closes.
window.addEventListener("beforeunload", () => {
  if (saveTimer) {
    clearTimeout(saveTimer);
    try { fetch("/api/data", { method: "PUT", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify(state) }); } catch {}
  }
});

/* ================= Helpers ================= */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DAY = 86400000;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const COLORS = ["#9a8cd0", "#e3a977", "#7fb8a4", "#d98aa6", "#7aa6d6", "#c7a85c", "#a58bd6", "#e08a7a"];

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
const classColor = (id) => classById(id)?.color || "#9a8cd0";
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

/* ================= Sound effects (synthesized, no files) ================= */

// Each sound is a list of soft notes: [frequency Hz, start s, length s, waveform, loudness]
const SOUNDS = {
  complete: [[659.25, 0, 0.18, "sine", 1], [987.77, 0.09, 0.35, "sine", 0.9], [1318.5, 0.18, 0.5, "triangle", 0.35]],
  uncheck:  [[523.25, 0, 0.14, "sine", 0.7], [392.0, 0.07, 0.22, "sine", 0.6]],
  add:      [[587.33, 0, 0.12, "triangle", 0.8], [880.0, 0.06, 0.25, "sine", 0.7]],
  delete:   [[311.13, 0, 0.16, "sine", 0.8], [207.65, 0.08, 0.3, "sine", 0.7]],
  click:    [[1046.5, 0, 0.05, "sine", 0.35]],
  open:     [[783.99, 0, 0.1, "sine", 0.45], [1046.5, 0.05, 0.14, "sine", 0.35]],
  theme:    [[440, 0, 0.25, "sine", 0.5], [554.37, 0.08, 0.3, "sine", 0.45], [659.25, 0.16, 0.4, "sine", 0.4]],
  alert:    [[880, 0, 0.6, "sine", 0.8], [1318.5, 0, 0.6, "sine", 0.25], [880, 0.35, 0.8, "sine", 0.6], [1318.5, 0.35, 0.8, "sine", 0.2]],
  timer:    [[523.25, 0, 0.6, "sine", 0.9], [659.25, 0.18, 0.6, "sine", 0.9], [783.99, 0.36, 0.7, "sine", 0.9], [1046.5, 0.54, 1.1, "triangle", 0.5]],
  allDone:  [[523.25, 0, 0.2, "triangle", 0.8], [659.25, 0.1, 0.2, "triangle", 0.8], [783.99, 0.2, 0.2, "triangle", 0.8], [1046.5, 0.3, 0.7, "sine", 0.9], [1318.5, 0.42, 0.8, "sine", 0.4]],
};

let audioCtx = null;
function sfx(name) {
  const s = state.settings;
  if (s.sounds === false) return;
  const notes = SOUNDS[name];
  if (!notes) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const vol = (s.volume ?? 60) / 100 * 0.22;
    const t0 = audioCtx.currentTime + 0.01;
    for (const [f, start, len, type, loud] of notes) {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = type; o.frequency.value = f;
      const at = t0 + start;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * loud), at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + len);
      o.connect(g).connect(audioCtx.destination);
      o.start(at); o.stop(at + len + 0.05);
    }
  } catch {}
}

/* ================= Theme ================= */

function applyTheme() {
  const pref = state.settings.theme || "auto";
  const dark = pref === "dark" || (pref === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  $("#themeBtn").textContent = dark ? "☀️" : "🌙";
  $("#themeBtn").title = dark ? "Switch to light mode" : "Switch to dark mode";
  try { localStorage.setItem("ct-theme", pref); } catch {}
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
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + tab));
  render();
  try { history.replaceState(null, "", "#" + tab); } catch {}
}
$("#tabs").addEventListener("click", (e) => { const b = e.target.closest("button[data-tab]"); if (b) { sfx("click"); showTab(b.dataset.tab); } });

/* ================= Form dialog ================= */

function openForm({ title, fields, submitLabel = "Save", onSubmit }) {
  const dlg = $("#formDialog");
  $("#dialogTitle").textContent = title;
  $("#dialogSubmit").textContent = submitLabel;
  $("#dialogFields").innerHTML = fields.map(fieldHtml).join("");
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
    const flat = fields.flatMap((f) => (f.type === "row" ? f.fields : [f]));
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
    title: id ? "Edit class" : "Add a class",
    fields: [
      { name: "name", label: "Class name", value: c.name, required: true, placeholder: "Intro to Psychology" },
      { type: "row", fields: [
        { name: "code", label: "Course code", value: c.code, placeholder: "PSY 101" },
        { name: "credits", label: "Credits", type: "number", value: c.credits, min: 0, step: "0.5", placeholder: "3" },
      ] },
      { type: "row", fields: [
        { name: "instructor", label: "Instructor", value: c.instructor, placeholder: "Dr. Rivera" },
        { name: "location", label: "Room", value: c.location, placeholder: "Hall B 204" },
      ] },
      { name: "days", label: "Meets on", type: "days", value: c.days || [] },
      { type: "row", fields: [
        { name: "start", label: "Start time", type: "time", value: c.start },
        { name: "end", label: "End time", type: "time", value: c.end },
      ] },
      { name: "officeHours", label: "Office hours / contact", value: c.officeHours, placeholder: "Tue 2–3pm · rivera@school.edu" },
      { name: "color", label: "Color", type: "color", value: c.color || COLORS[state.classes.length % COLORS.length] },
    ],
    onSubmit: (v) => {
      if (id) Object.assign(c, v);
      else state.classes.push({ id: uid(), ...v, createdAt: Date.now() });
      save(); render(); sfx(id ? "click" : "add"); toast(id ? "Class updated" : "Class added ✓");
    },
  });
}

function deleteClass(id) {
  const c = classById(id);
  const n = state.assignments.filter((a) => a.classId === id).length;
  if (!confirm(`Delete "${c.name}"${n ? ` and its ${n} assignment${n > 1 ? "s" : ""}` : ""}? Exams for this class will be kept.`)) return;
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

function editAssignment(id, classId) {
  const a = state.assignments.find((x) => x.id === id) || {};
  if (!state.classes.length && !id) { toast("Add a class first"); return editClass(); }
  openForm({
    title: id ? "Edit assignment" : "Add assignment",
    fields: [
      { name: "title", label: "Assignment", value: a.title, required: true, placeholder: "Lab report #3" },
      { name: "classId", label: "Class", type: "select", options: classOptions(false), value: a.classId || classId || state.classes[0]?.id },
      { type: "row", fields: [
        { name: "due", label: "Due", type: "datetime-local", value: a.due || defaultDue(), required: true },
        { name: "priority", label: "Priority", type: "select", value: a.priority || "medium", options: [
          { value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }] },
      ] },
      { name: "type", label: "Type", type: "select", value: a.type || "Homework", options:
        ["Homework", "Essay", "Project", "Lab", "Reading", "Quiz", "Discussion post", "Presentation", "Other"].map((x) => ({ value: x, label: x })) },
      { name: "notes", label: "Notes / link", type: "textarea", value: a.notes, placeholder: "Pages 40–62, submit on Canvas…" },
    ],
    onSubmit: (v) => {
      if (id) Object.assign(a, v);
      else state.assignments.push({ id: uid(), ...v, done: false, createdAt: Date.now() });
      save(); render(); sfx(id ? "click" : "add"); toast(id ? "Assignment updated" : "Assignment added ✓");
    },
  });
}

function toggleAssignment(id) {
  const a = state.assignments.find((x) => x.id === id);
  if (!a) return;
  a.done = !a.done;
  a.doneAt = a.done ? Date.now() : null;
  save(); render();
  if (a.done) {
    const rest = state.assignments.filter((x) => x.classId === a.classId && !x.done);
    if (!rest.length) { sfx("allDone"); toast(`Everything in ${className(a.classId)} is done! 🎉`); }
    else { sfx("complete"); toast(cheer()); }
  } else sfx("uncheck");
}

function deleteAssignment(id) {
  const a = state.assignments.find((x) => x.id === id);
  if (!confirm(`Delete "${a.title}"?`)) return;
  state.assignments = state.assignments.filter((x) => x.id !== id);
  save(); render(); sfx("delete");
}

function editExam(id) {
  const e = state.exams.find((x) => x.id === id) || {};
  const d = new Date(Date.now() + 7 * DAY); d.setHours(10, 0, 0, 0);
  openForm({
    title: id ? "Edit exam" : "Add exam",
    fields: [
      { name: "title", label: "Exam", value: e.title, required: true, placeholder: "Midterm 1" },
      { name: "classId", label: "Class", type: "select", options: classOptions(true), value: e.classId },
      { type: "row", fields: [
        { name: "date", label: "Date & time", type: "datetime-local", value: e.date || toLocalInput(d), required: true },
        { name: "location", label: "Location", value: e.location, placeholder: "Room 110" },
      ] },
      { name: "topics", label: "Topics / chapters", type: "textarea", value: e.topics, placeholder: "Ch. 1–5, lecture slides weeks 1–6" },
      { type: "row", fields: [
        { name: "weight", label: "Worth (% of grade)", type: "number", value: e.weight, min: 0, max: 100, placeholder: "25" },
        { name: "score", label: "Score (after)", type: "number", value: e.score, min: 0, step: "0.1", placeholder: "—" },
      ] },
      { name: "ready", label: "I feel ready for this one", type: "checkbox", value: e.ready },
    ],
    onSubmit: (v) => {
      if (id) Object.assign(e, v);
      else state.exams.push({ id: uid(), ...v, createdAt: Date.now() });
      save(); render(); sfx(id ? "click" : "add"); toast(id ? "Exam updated" : "Exam added ✓");
    },
  });
}

function deleteExam(id) {
  const e = state.exams.find((x) => x.id === id);
  if (!confirm(`Delete "${e.title}"?`)) return;
  state.exams = state.exams.filter((x) => x.id !== id);
  save(); render(); sfx("delete");
}

const CHEERS = ["Nice work! ✨", "One less thing 🎉", "Done and dusted ✓", "Keep that streak going 💜", "Look at you go 🌟", "Crushed it ✓"];
const cheer = () => CHEERS[Math.floor(Math.random() * CHEERS.length)];

/* ================= Rendering: shared pieces ================= */

function assignmentRow(a, { showClass = true } = {}) {
  const u = urgency(a.due, a.done);
  const chip = u === "overdue" ? `<span class="chip overdue">${esc(relative(a.due))}</span>`
    : u === "soon" ? `<span class="chip soon">${esc(relative(a.due))}</span>`
    : u === "done" ? `<span class="chip low">done</span>` : `<span>${esc(relative(a.due))}</span>`;
  return `<li class="item ${a.done ? "done" : ""}">
    <input type="checkbox" class="check" style="--c:${esc(classColor(a.classId))}" data-action="toggle" data-id="${a.id}" ${a.done ? "checked" : ""} title="Mark done"/>
    <div class="body">
      <div class="title">${esc(a.title)}</div>
      <div class="meta">
        ${showClass ? `<span class="dot" style="background:${esc(classColor(a.classId))}"></span><span>${esc(className(a.classId))}</span>·` : ""}
        <span>${esc(fmtDate(a.due))}</span>·${chip}
        ${a.priority && a.priority !== "medium" ? `<span class="chip ${a.priority}">${a.priority}</span>` : ""}
        ${a.type ? `<span class="chip">${esc(a.type)}</span>` : ""}
      </div>
      ${a.notes ? `<div class="meta">${linkify(a.notes)}</div>` : ""}
    </div>
    <div class="actions">
      <button class="link-btn" data-action="edit-assignment" data-id="${a.id}" title="Edit">✎</button>
      <button class="link-btn" data-action="delete-assignment" data-id="${a.id}" title="Delete">✕</button>
    </div>
  </li>`;
}

function linkify(text) {
  return esc(text).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g, "<br>");
}

function examRow(e) {
  const d = parse(e.date);
  const days = Math.round((startOfDay(d) - startOfDay(new Date())) / DAY);
  const past = d < Date.now();
  return `<li class="item">
    <span class="chip exam" style="margin-top:.15rem">EXAM</span>
    <div class="body">
      <div class="title">${esc(e.title)}</div>
      <div class="meta"><span class="dot" style="background:${esc(classColor(e.classId))}"></span>${esc(className(e.classId))} · ${esc(fmtDate(e.date))}
        · <span class="chip ${past ? "" : days <= 3 ? "overdue" : days <= 7 ? "soon" : ""}">${past ? "past" : days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}</span></div>
    </div>
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

/* ================= Dashboard ================= */

function renderDashboard() {
  const now = new Date();
  const hr = now.getHours();
  const greet = hr < 5 ? "Up late" : hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";
  const pending = state.assignments.filter((a) => !a.done);
  const overdue = pending.filter((a) => parse(a.due) < now);
  const week = pending.filter((a) => { const d = parse(a.due); return d >= now && d - now < 7 * DAY; });
  const examsSoon = state.exams.filter((e) => { const d = parse(e.date); return d >= now && d - now < 14 * DAY; });
  const weekAgo = Date.now() - 7 * DAY;
  const doneWeek = state.assignments.filter((a) => a.done && a.doneAt > weekAgo);

  // Group upcoming
  const groups = { Overdue: [], Today: [], Tomorrow: [], "This week": [], Later: [] };
  const today0 = startOfDay(now);
  for (const a of pending.sort(byDue)) {
    const d = parse(a.due);
    const diff = Math.round((startOfDay(d) - today0) / DAY);
    if (d < now) groups.Overdue.push(a);
    else if (diff === 0) groups.Today.push(a);
    else if (diff === 1) groups.Tomorrow.push(a);
    else if (diff < 7) groups["This week"].push(a);
    else if (diff < 21) groups.Later.push(a);
  }
  const groupHtml = Object.entries(groups).filter(([, v]) => v.length)
    .map(([k, v]) => `<div class="group-label">${k} · ${v.length}</div><ul class="items">${v.map((a) => assignmentRow(a)).join("")}</ul>`).join("");

  // Today's classes
  const todays = state.classes.filter((c) => (c.days || []).includes(now.getDay())).sort((a, b) => (a.start || "").localeCompare(b.start || ""));
  const nowT = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const nextExams = state.exams.filter((e) => parse(e.date) >= now).sort(byDate).slice(0, 4);

  const notifBanner = "Notification" in window && Notification.permission === "default" && !state.settings.dismissedNotifBanner
    ? `<div class="banner"><span>🔔</span><div class="grow"><b>Turn on desktop reminders?</b> <span class="muted">Get a pop-up when something is due within ${state.settings.alertHours} hours — even if this tab is in the background.</span></div>
        <button class="btn primary small" data-action="enable-notifs">Turn on</button><button class="btn ghost small" data-action="dismiss-notif-banner">Not now</button></div>` : "";

  $("#view-dashboard").innerHTML = `
    <div class="page-head">
      <div><h1>${greet} 👋</h1><div class="muted">${now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}${quoteOfDay()}</div></div>
      <div class="row" style="flex:none">
        <button class="btn" data-action="add-exam">+ Exam</button>
        <button class="btn primary" data-action="add-assignment">+ Assignment</button>
      </div>
    </div>
    ${notifBanner}
    <div class="stats">
      <div class="card stat danger"><span class="ico">!</span><div class="num">${overdue.length}</div><div class="label">Overdue</div></div>
      <div class="card stat warn"><span class="ico">◷</span><div class="num">${week.length}</div><div class="label">Next 7 days</div></div>
      <div class="card stat lav"><span class="ico">✎</span><div class="num">${examsSoon.length}</div><div class="label">Exams in 2 weeks</div></div>
      <div class="card stat ok"><span class="ico">✓</span><div class="num">${doneWeek.length}</div><div class="label">Done this week</div></div>
    </div>
    <div class="grid grid-2">
      <div class="card">
        <h2>Coming up</h2>
        ${groupHtml || (state.classes.length
          ? `<div class="empty"><div class="big">🌿</div>Nothing due in the next 3 weeks. Enjoy the calm.</div>`
          : `<div class="empty"><div class="big">📚</div>Start by adding your classes.<br><br><button class="btn primary" data-action="add-class">+ Add your first class</button></div>`)}
      </div>
      <div class="grid" style="align-content:start">
        <div class="card today-classes">
          <h2>Today's classes</h2>
          ${todays.length ? todays.map((c) => {
            const live = c.start && c.end && nowT >= c.start && nowT <= c.end;
            const past = c.end && nowT > c.end;
            return `<div class="tc" style="${past ? "opacity:.5" : ""}"><span class="time">${c.start ? fmtTime(c.start) : "—"}${c.end ? "–" + fmtTime(c.end) : ""}</span>
              <span class="dot" style="background:${esc(c.color)}"></span><div><b>${esc(c.name)}</b>${live ? ' <span class="chip soon">now</span>' : ""}<div class="small muted">${esc([c.location, c.instructor].filter(Boolean).join(" · "))}</div></div></div>`;
          }).join("") : `<div class="muted">No classes scheduled today${state.classes.length ? "" : " — add meeting days to your classes to see them here"}.</div>`}
        </div>
        <div class="card">
          <h2>Next exams</h2>
          ${nextExams.length ? `<ul class="items">${nextExams.map(examRow).join("")}</ul>` : `<div class="muted">No upcoming exams. <a href="#" data-action="add-exam">Add one</a></div>`}
        </div>
      </div>
    </div>`;
}

const QUOTES = [
  "Small steps every day.", "Done is better than perfect.", "You don't have to see the whole staircase, just the first step.",
  "Rest is part of the work.", "Future you says thanks.", "Progress, not perfection.", "One assignment at a time.",
];
const quoteOfDay = () => ` · <i>${QUOTES[new Date().getDate() % QUOTES.length]}</i>`;

/* ================= Classes ================= */

const classUi = { showDone: {} };

function renderClasses() {
  const cards = state.classes.map((c) => {
    const list = state.assignments.filter((a) => a.classId === c.id).sort(byDue);
    const done = list.filter((a) => a.done).length;
    const pct = list.length ? Math.round((done / list.length) * 100) : 0;
    const showDone = classUi.showDone[c.id];
    const visible = showDone ? list : list.filter((a) => !a.done);
    const sched = (c.days || []).length ? `${c.days.map((d) => DOW[d]).join("/")} ${c.start ? fmtTime(c.start) : ""}${c.end ? "–" + fmtTime(c.end) : ""}` : "";
    const exams = state.exams.filter((e) => e.classId === c.id && parse(e.date) >= Date.now()).sort(byDate);
    return `<div class="card class-card" style="--c:${esc(c.color)}">
      <div class="class-head">
        <div class="class-title"><span class="list-icon">${esc(initials(c))}</span>
          <div style="min-width:0"><h2>${esc(c.name)}</h2>
          <div class="class-sub">${esc([c.code, c.credits ? c.credits + " cr" : "", c.instructor, c.location, sched].filter(Boolean).join(" · "))}</div>
          ${c.officeHours ? `<div class="class-sub">Office hours: ${esc(c.officeHours)}</div>` : ""}
        </div></div>
        <div class="actions" style="display:flex">
          <button class="link-btn" data-action="edit-class" data-id="${c.id}" title="Edit class">✎</button>
          <button class="link-btn" data-action="delete-class" data-id="${c.id}" title="Delete class">✕</button>
        </div>
      </div>
      <div class="progress"><div style="width:${pct}%"></div></div>
      <div class="small muted" style="margin-bottom:.3rem">${done}/${list.length} assignments done${exams.length ? ` · next exam: <b>${esc(exams[0].title)}</b> ${esc(relative(exams[0].date))}` : ""}</div>
      ${visible.length ? `<ul class="items">${visible.map((a) => assignmentRow(a, { showClass: false })).join("")}</ul>`
        : `<div class="muted small" style="padding:.5rem 0">${list.length ? "All caught up 🎉" : "No assignments yet."}</div>`}
      <div class="class-foot">
        <button class="btn small primary" data-action="add-assignment" data-class="${c.id}">+ Add assignment</button>
        ${done ? `<button class="link-btn small" data-action="toggle-done-view" data-id="${c.id}">${showDone ? "Hide" : "Show"} completed (${done})</button>` : ""}
      </div>
    </div>`;
  }).join("");

  $("#view-classes").innerHTML = `
    <div class="page-head"><div><h1>Classes</h1><div class="muted">Each class holds its own assignments.</div></div>
      <button class="btn primary" data-action="add-class">+ Add class</button></div>
    ${state.classes.length ? `<div class="grid grid-2">${cards}</div>`
      : `<div class="card empty"><div class="big">📚</div>No classes yet. Add one to start tracking assignments.<br><br><button class="btn primary" data-action="add-class">+ Add class</button></div>`}`;
}

function initials(c) {
  const src = (c.code || c.name || "?").replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/);
  if (c.code && src.length >= 2 && /\d/.test(src[1])) return src[0].slice(0, 3).toUpperCase();
  return src.slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

/* ================= Exams ================= */

function renderExams() {
  const now = Date.now();
  const upcoming = state.exams.filter((e) => parse(e.date) >= now - 3 * 3600000).sort(byDate);
  const past = state.exams.filter((e) => parse(e.date) < now - 3 * 3600000).sort(byDate).reverse();

  const card = (e, isPast) => {
    const d = parse(e.date);
    const days = Math.round((startOfDay(d) - startOfDay(new Date())) / DAY);
    const hrs = Math.max(0, Math.round((d - now) / 3600000));
    const cls = isPast ? "" : days <= 2 ? "urgent" : days <= 7 ? "soon" : "";
    const cd = isPast ? `<span class="n">${e.score !== "" && e.score != null ? esc(e.score) : "✓"}</span><span class="u">${e.score !== "" && e.score != null ? "score" : "done"}</span>`
      : days === 0 ? `<span class="n">${hrs}</span><span class="u">hours</span>`
      : `<span class="n">${days}</span><span class="u">day${days === 1 ? "" : "s"}</span>`;
    return `<div class="card exam-card" style="${isPast ? "opacity:.75" : ""}">
      <div class="countdown ${cls}">${cd}</div>
      <div style="flex:1;min-width:0">
        <div class="row" style="justify-content:space-between"><h3 style="margin:0">${esc(e.title)}</h3>
          <div style="flex:none"><button class="link-btn" data-action="edit-exam" data-id="${e.id}" title="Edit">✎</button><button class="link-btn" data-action="delete-exam" data-id="${e.id}" title="Delete">✕</button></div></div>
        <div class="meta small muted" style="display:flex;gap:.4rem;flex-wrap:wrap;align-items:center">
          <span class="dot" style="background:${esc(classColor(e.classId))}"></span>${esc(className(e.classId))} · ${esc(fmtDate(e.date))}${e.location ? " · 📍 " + esc(e.location) : ""}${e.weight ? ` · ${esc(e.weight)}% of grade` : ""}
          ${!isPast ? (e.ready ? '<span class="chip low">ready ✓</span>' : '<span class="chip">still prepping</span>') : ""}
        </div>
        ${e.topics ? `<div class="small" style="margin-top:.35rem">${linkify(e.topics)}</div>` : ""}
        ${!isPast && days > 0 && days <= 14 ? `<div class="small muted" style="margin-top:.35rem">💡 ${studyPlanHint(days)}</div>` : ""}
      </div>
    </div>`;
  };

  $("#view-exams").innerHTML = `
    <div class="page-head"><div><h1>Exams</h1><div class="muted">Countdowns, topics and a gentle study nudge.</div></div>
      <button class="btn primary" data-action="add-exam">+ Add exam</button></div>
    ${upcoming.length ? `<div class="grid grid-2">${upcoming.map((e) => card(e, false)).join("")}</div>`
      : `<div class="card empty"><div class="big">📝</div>No upcoming exams.<br><br><button class="btn primary" data-action="add-exam">+ Add exam</button></div>`}
    ${past.length ? `<h2 style="margin-top:2rem">Past exams</h2><div class="grid grid-2">${past.map((e) => card(e, true)).join("")}</div>` : ""}`;
}

function studyPlanHint(days) {
  if (days <= 1) return "Light review tonight, then sleep — rest beats cramming.";
  if (days <= 3) return "Do practice problems / a mock test, and review what you missed.";
  if (days <= 7) return `Spread review over ${days} days: ~1 topic a day with active recall.`;
  return "Start a spaced-repetition deck now and revisit it every few days.";
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
  state.exams.forEach((e) => e.date && push(e.date.slice(0, 10), { t: "📝 " + e.title, c: classColor(e.classId), kind: "e", ref: e }));

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
        <button class="btn small" data-action="cal-prev">‹</button>
        <button class="btn small" data-action="cal-today">Today</button>
        <button class="btn small" data-action="cal-next">›</button>
      </div>
      <div class="cal-grid">${cells}</div>
    </div>
    <div class="card" style="margin-top:1rem">
      <div class="row" style="justify-content:space-between"><h2 style="margin:0">${selDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</h2>
        <button class="btn small primary" data-action="add-assignment-on" data-key="${cal.sel}" style="flex:none">+ Assignment this day</button></div>
      ${selClasses.length ? `<div class="small muted" style="margin:.5rem 0">Classes: ${selClasses.map((c) => `<span class="dot" style="background:${esc(c.color)}"></span> ${esc(c.code || c.name)} ${c.start ? fmtTime(c.start) : ""}`).join(" · ")}</div>` : ""}
      ${selEv.length ? `<ul class="items" style="margin-top:.5rem">${selEv.map((e) => (e.kind === "a" ? assignmentRow(e.ref) : examRow(e.ref))).join("")}</ul>`
        : `<div class="muted" style="margin-top:.5rem">Nothing due this day.</div>`}
    </div>`;
}

/* ================= Student tools ================= */

const GRADE_POINTS = { "A+": 4.0, A: 4.0, "A-": 3.7, "B+": 3.3, B: 3.0, "B-": 2.7, "C+": 2.3, C: 2.0, "C-": 1.7, "D+": 1.3, D: 1.0, "D-": 0.7, F: 0 };

const pomo = { mode: "focus", left: null, running: false, timer: null, count: 0 };

function renderTools() {
  const s = state.settings;
  const p = state.pomodoro;
  if (pomo.left == null) pomo.left = p[pomo.mode] * 60;
  const todayK = dateKey(new Date());
  const todayCount = p.history[todayK] || 0;
  const weekMins = Object.entries(p.history).filter(([k]) => new Date(k + "T00:00") > Date.now() - 7 * DAY).reduce((n, [, v]) => n + v, 0) * p.focus;

  const gpaRows = state.gpa.courses.map((c, i) => `<tr>
    <td><input type="text" data-gpa="${i}" data-f="name" value="${esc(c.name)}" placeholder="Course"/></td>
    <td style="width:5.5rem"><input type="number" data-gpa="${i}" data-f="credits" value="${esc(c.credits)}" min="0" step="0.5" placeholder="Cr"/></td>
    <td style="width:5.5rem"><select data-gpa="${i}" data-f="grade">${Object.keys(GRADE_POINTS).map((g) => `<option ${g === c.grade ? "selected" : ""}>${g}</option>`).join("")}</select></td>
    <td><button class="link-btn" data-action="gpa-remove" data-i="${i}">✕</button></td></tr>`).join("");

  $("#view-tools").innerHTML = `
    <div class="page-head"><div><h1>Student Tools</h1><div class="muted">Little things that make college easier.</div></div></div>
    <div class="grid grid-3">

      <div class="card timer">
        <h2>Focus timer</h2>
        <div class="mode-pills">
          ${["focus", "short", "long"].map((m) => `<button data-action="pomo-mode" data-mode="${m}" class="${pomo.mode === m ? "active" : ""}">${{ focus: "Focus", short: "Short break", long: "Long break" }[m]}</button>`).join("")}
        </div>
        <div class="ring">
          <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="none" stroke="var(--surface-2)" stroke-width="6"/>
            <circle id="pomoRing" cx="50" cy="50" r="45" fill="none" stroke="var(--lavender)" stroke-width="6" stroke-linecap="round" stroke-dasharray="282.7" stroke-dashoffset="0"/></svg>
          <div class="time" id="pomoTime">00:00</div>
        </div>
        <div class="row" style="justify-content:center;margin-top:.6rem">
          <button class="btn primary" data-action="pomo-start" style="flex:none" id="pomoStart">${pomo.running ? "Pause" : "Start"}</button>
          <button class="btn" data-action="pomo-reset" style="flex:none">Reset</button>
        </div>
        <div class="small muted" style="margin-top:.6rem">Today: <b>${todayCount}</b> session${todayCount === 1 ? "" : "s"} · Last 7 days: <b>${Math.round(weekMins / 60 * 10) / 10}</b> h focused</div>
        <div class="row small" style="margin-top:.6rem">
          <label>Focus <input type="number" data-pomo="focus" value="${p.focus}" min="1" max="120"/></label>
          <label>Short <input type="number" data-pomo="short" value="${p.short}" min="1" max="60"/></label>
          <label>Long <input type="number" data-pomo="long" value="${p.long}" min="1" max="60"/></label>
        </div>
      </div>

      <div class="card">
        <h2>What do I need on the final?</h2>
        <label class="field"><span>Current grade in class (%)</span><input type="number" id="fgCurrent" value="${esc(fg.cur)}" placeholder="84" step="0.1"/></label>
        <label class="field"><span>Final exam is worth (% of grade)</span><input type="number" id="fgWeight" value="${esc(fg.w)}" placeholder="30" step="0.1"/></label>
        <label class="field"><span>Grade I want (%)</span><input type="number" id="fgTarget" value="${esc(fg.t)}" placeholder="90" step="0.1"/></label>
        <div id="fgResult"></div>
      </div>

      <div class="card">
        <h2>GPA calculator</h2>
        <table class="gpa">${gpaRows || `<tr><td class="muted small">Add this semester's courses.</td></tr>`}</table>
        <div class="row" style="margin:.5rem 0">
          <button class="btn small" data-action="gpa-add" style="flex:none">+ Course</button>
          ${state.classes.length ? `<button class="btn small ghost" data-action="gpa-import" style="flex:none">Import my classes</button>` : ""}
        </div>
        <div class="row small">
          <label>Prior GPA <input type="number" id="gpaPrior" value="${esc(state.gpa.priorGpa)}" step="0.01" min="0" max="4" placeholder="optional"/></label>
          <label>Prior credits <input type="number" id="gpaPriorCr" value="${esc(state.gpa.priorCredits)}" min="0" placeholder="optional"/></label>
        </div>
        <div id="gpaResult"></div>
      </div>

      <div class="card">
        <h2>Quick notes</h2>
        <textarea id="quickNotes" style="min-height:200px" placeholder="Things to ask the professor, books to buy, ideas…">${esc(state.notes)}</textarea>
        <div class="small muted">Saves automatically.</div>
      </div>

      <div class="card">
        <h2>My links</h2>
        <ul class="resource-list">${state.links.map((l, i) => `<li class="row" style="flex-wrap:nowrap"><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.name)}</a><button class="link-btn" style="flex:none" data-action="link-remove" data-i="${i}">✕</button></li>`).join("") || `<li class="muted small">Save your school portal, Canvas/Blackboard, email, library…</li>`}</ul>
        <button class="btn small" data-action="link-add" style="margin-top:.6rem">+ Add link</button>
      </div>

      <div class="card">
        <h2>Study tips that work</h2>
        <ul class="tips small">
          <li><b>Active recall:</b> close the notes and try to write/explain it from memory — then check.</li>
          <li><b>Spaced repetition:</b> review after 1 day, 3 days, a week. Short and often beats one long session.</li>
          <li><b>Feynman technique:</b> explain it simply, like to a friend. The gaps show you what to study.</li>
          <li><b>Practice tests:</b> old exams and end-of-chapter problems are the best predictor of how you'll do.</li>
          <li><b>Interleave:</b> mix problem types instead of doing 20 of the same in a row.</li>
          <li><b>Sleep:</b> memory consolidates overnight — an all-nighter usually costs more than it gains.</li>
          <li><b>Office hours:</b> go early in the semester, not the week before the exam.</li>
          <li><b>Read the syllabus:</b> add every deadline and exam here in week one.</li>
        </ul>
      </div>

      <div class="card">
        <h2>Handy resources</h2>
        <ul class="resource-list small">
          <li><a href="https://www.khanacademy.org" target="_blank" rel="noopener">Khan Academy</a> — free lessons for math, science, econ</li>
          <li><a href="https://www.desmos.com/calculator" target="_blank" rel="noopener">Desmos</a> — graphing calculator</li>
          <li><a href="https://www.wolframalpha.com" target="_blank" rel="noopener">Wolfram|Alpha</a> — check math & science work</li>
          <li><a href="https://owl.purdue.edu" target="_blank" rel="noopener">Purdue OWL</a> — writing help, APA/MLA/Chicago citations</li>
          <li><a href="https://www.zotero.org" target="_blank" rel="noopener">Zotero</a> — free citation & research manager</li>
          <li><a href="https://apps.ankiweb.net" target="_blank" rel="noopener">Anki</a> — spaced-repetition flashcards</li>
          <li><a href="https://scholar.google.com" target="_blank" rel="noopener">Google Scholar</a> — find papers & sources</li>
          <li><a href="https://education.github.com/pack" target="_blank" rel="noopener">GitHub Student Pack</a> — free dev tools with a .edu</li>
          <li><a href="https://openstax.org" target="_blank" rel="noopener">OpenStax</a> — free, peer-reviewed textbooks</li>
        </ul>
        <div class="small muted" style="margin-top:.6rem">Also check your school for free tutoring, a writing center, counseling, and student software deals.</div>
      </div>

      <div class="card">
        <h2>Settings & backup</h2>
        <label class="field"><span>Warn me about things due within</span>
          <select id="setAlert">${[12, 24, 48, 72, 168].map((h) => `<option value="${h}" ${s.alertHours === h ? "selected" : ""}>${h < 168 ? h + " hours" : "1 week"}</option>`).join("")}</select></label>
        <label class="field"><span>Theme</span>
          <select id="setTheme">${[["auto", "Match my system"], ["light", "Light · bisque"], ["dark", "Dark · lavender night"]].map(([v, l]) => `<option value="${v}" ${s.theme === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <div class="setting-row"><span class="lbl">Desktop reminders ${s.notifications ? `<button class="link-btn small" data-action="test-notif">Test</button>` : ""}</span>
          <label class="switch"><input type="checkbox" id="setNotifs" ${"Notification" in window && Notification.permission === "granted" && s.notifications ? "checked" : ""}/><span></span></label></div>
        <div class="setting-row"><span class="lbl">Sound effects <button class="link-btn small" data-action="preview-sound">Try</button></span>
          <label class="switch"><input type="checkbox" id="setSounds" ${s.sounds === false ? "" : "checked"}/><span></span></label></div>
        <div class="setting-row"><span class="muted small" style="flex:none">🔈</span><input type="range" id="setVolume" min="0" max="100" value="${s.volume ?? 60}" ${s.sounds === false ? "disabled" : ""}/><span class="muted small" style="flex:none">🔊</span></div>
        <div class="row">
          <button class="btn small" data-action="export" style="flex:none">⬇ Export backup</button>
          <label class="btn small" style="flex:none">⬆ Import<input type="file" id="importFile" accept=".json,application/json" hidden/></label>
        </div>
        <div class="small muted" style="margin-top:.6rem">${serverOnline ? "✓ Saving to <code>data/tracker.json</code> on your computer." : "⚠ Server offline — saving in this browser only. Run <code>npm start</code>."}</div>
      </div>
    </div>`;

  updatePomoDisplay();
  calcFinal();
  calcGpa();
}

const fg = { cur: "", w: "", t: "" };
function calcFinal() {
  if ($("#fgCurrent")) { fg.cur = $("#fgCurrent").value; fg.w = $("#fgWeight").value; fg.t = $("#fgTarget").value; }
  const cur = parseFloat($("#fgCurrent")?.value), w = parseFloat($("#fgWeight")?.value), t = parseFloat($("#fgTarget")?.value);
  const out = $("#fgResult");
  if (!out) return;
  if ([cur, w, t].some(isNaN) || w <= 0 || w > 100) { out.innerHTML = ""; return; }
  const need = (t - cur * (1 - w / 100)) / (w / 100);
  const r = Math.round(need * 10) / 10;
  out.innerHTML = need > 100 ? `<div class="result bad">You'd need ${r}% — above 100%. Talk to your professor about extra credit, or aim for a slightly lower target.</div>`
    : need <= 0 ? `<div class="result good">You've already locked in ${t}% — even a 0 keeps it. (Still show up 😉)</div>`
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
function updatePomoDisplay() {
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
    ring.style.strokeDashoffset = String(282.7 * (1 - pomo.left / total));
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
  try { new Notification(title, { body, icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎓</text></svg>" }); } catch {}
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

  if (!$("#alertDrawer").hidden) renderDrawer();
}

function renderDrawer() {
  const items = alertItems();
  $("#alertDrawer").innerHTML = `<h3>Within the next ${state.settings.alertHours < 168 ? state.settings.alertHours + " hours" : "week"}</h3>
    ${items.length ? `<ul class="items">${items.map((i) => (i.kind === "a" ? assignmentRow(i.ref) : examRow(i.ref))).join("")}</ul>`
      : `<div class="muted">You're all clear. 🌿</div>`}`;
}

$("#bellBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  const d = $("#alertDrawer");
  d.hidden = !d.hidden;
  if (!d.hidden) renderDrawer();
});
document.addEventListener("click", (e) => {
  const d = $("#alertDrawer");
  if (!d.hidden && !d.contains(e.target) && !e.target.closest("#bellBtn") && !e.target.closest("dialog")) d.hidden = true;
});

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
      editAssignment();
      const input = $('#formDialog input[name="due"]');
      if (input) input.value = `${el.dataset.key}T23:59`;
      return;
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
    case "test-notif": notify("Test reminder 🎓", "This is what a heads-up looks like."); return;
    case "pomo-mode": return setPomoMode(el.dataset.mode, false);
    case "pomo-start":
      if (pomo.running) stopPomo();
      else { pomo.running = true; pomo.timer = setInterval(pomoTick, 1000); }
      sfx("click");
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
});

document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.dataset.pomo) {
    const v = Math.max(1, Math.min(120, parseInt(t.value) || 1));
    state.pomodoro[t.dataset.pomo] = v; save();
    if (!pomo.running && pomo.mode === t.dataset.pomo) { pomo.left = v * 60; updatePomoDisplay(); }
  }
  if (t.id === "setSounds") { state.settings.sounds = t.checked; save(); if (t.checked) sfx("complete"); $("#setVolume").disabled = !t.checked; }
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
  if (!serverOnline) toast("Server not running — data is saved in this browser only");
})();
