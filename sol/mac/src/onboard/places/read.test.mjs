// node --test read.test.mjs: the store reader on made-up homes (fake-home.mjs, makeStoreHome), never a real one.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { makeStoreHome, unlockStores, SECRET, writeNotes, writeCalendar, writeChromeProfile } from "./fake-home.mjs";
import { appleDate } from "./read.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const READ = path.join(HERE, "read.mjs");
const work = fs.mkdtempSync(path.join(os.tmpdir(), "sol-read-test-"));
const root = process.getuid?.() === 0;   // root reads through chmod 000

const homes = {};
for (const shape of ["all", "apps", "closed", "wechat", "format", "linux", "windows"]) homes[shape] = makeStoreHome(path.join(work, shape), shape);

test.after(() => {
  for (const h of Object.values(homes)) unlockStores(h);
  try { fs.chmodSync(path.join(homes.all, "Library/Safari"), 0o755); } catch { /* */ }
  fs.rmSync(work, { recursive: true, force: true });
});

let n = 0;
function read(store, home, extra = []) {
  const out = path.join(work, `out-${++n}.json`);
  execFileSync(process.execPath, [READ, "--store", store, "--home", home, "--out", out, ...extra], { encoding: "utf8" });
  return JSON.parse(fs.readFileSync(out, "utf8"));
}
const items = (r) => r.groups.flatMap((g) => g.items);
const titles = (r) => items(r).map((i) => i.title);
const shape = (r, store) => {
  assert.equal(r.v, 1);
  assert.equal(r.store, store);
  assert.equal(typeof r.ok, "boolean");
  assert.ok(Array.isArray(r.groups));
  for (const g of r.groups) {
    assert.ok(["folder", "calendar", "chat"].includes(g.kind));
    assert.equal(typeof g.name, "string");
    for (const i of g.items) {
      assert.equal(typeof i.title, "string");
      if (i.at !== undefined) assert.ok(!Number.isNaN(Date.parse(i.at)));
      assert.deepEqual(Object.keys(i).filter((k) => k !== "title" && k !== "at"), []);
    }
  }
  if (!r.ok) assert.ok(["switch", "encrypted", "format", "missing", "ask"].includes(r.need.kind) && r.need.line);
};
const noSecrets = (r) => { const s = JSON.stringify(r); for (const x of SECRET) assert.ok(!s.includes(x), `"${x}" leaked`); };
const days = (iso) => Math.round((Date.parse(iso) - Date.now()) / 864e5);

test("Apple dates: seconds and nanoseconds since 2001 both convert", () => {
  assert.equal(appleDate(0), undefined);
  assert.equal(appleDate(1), "2001-01-01T00:00:01.000Z");
  assert.equal(appleDate(1000000000), appleDate(1000000000n * 1000000000n));
  assert.equal(appleDate(1000000000), "2032-09-09T01:46:40.000Z");
});

test("Notes: folder names, note titles and dates; not the trash, not a deleted note, never a body", () => {
  const r = read("notes", homes.apps);
  shape(r, "notes");
  assert.equal(r.ok, true);
  assert.equal(r.source, "Library/Group Containers/group.com.apple.notes/NoteStore.sqlite");
  assert.deepEqual(r.groups.map((g) => g.name).sort(), ["Job search", "LA245 studio"]);
  const studio = r.groups.find((g) => g.name === "LA245 studio");
  assert.deepEqual(studio.items.map((i) => i.title), ["Site walk checklist", "Pin-up feedback"]);   // newest first
  assert.equal(days(studio.items[0].at), -2);
  assert.ok(!titles(r).includes("Old grocery list") && !titles(r).includes("A deleted draft"));
  noSecrets(r);
  assert.ok(!JSON.stringify(r).includes("three left"));
});

test("Calendar: calendar names, events from 14 days back to 60 ahead, never places or descriptions", () => {
  const r = read("calendar", homes.apps);
  shape(r, "calendar");
  assert.equal(r.ok, true);
  assert.deepEqual(r.groups.map((g) => g.name), ["Classes", "Work shifts"]);
  assert.deepEqual(titles(r).sort(), ["DS480 lecture", "LA245 studio crit", "Library desk shift"]);
  assert.equal(days(r.groups[0].items.find((i) => i.title === "DS480 lecture").at), -3);
  noSecrets(r);
  const shorter = read("calendar", homes.apps, ["--days", "3"]);
  assert.deepEqual(titles(shorter).sort(), ["DS480 lecture", "LA245 studio crit"]);
});

test("Calendar on older macOS: Library/Calendars/Calendar.sqlitedb", () => {
  const h = path.join(work, "older");
  writeCalendar(h, Math.floor(Date.now() / 1000));
  fs.mkdirSync(path.join(h, "Library/Calendars"), { recursive: true });
  fs.renameSync(path.join(h, "Library/Group Containers/group.com.apple.calendar/Calendar.sqlitedb"), path.join(h, "Library/Calendars/Calendar.sqlitedb"));
  const r = read("calendar", h);
  assert.equal(r.ok, true);
  assert.equal(r.source, "Library/Calendars/Calendar.sqlitedb");
});

test("chats are not read without --chats names: one question, nothing read", () => {
  for (const store of ["whatsapp", "messages"]) {
    const r = read(store, homes.apps);
    shape(r, store);
    assert.equal(r.ok, false);
    assert.deepEqual(r.need, { kind: "ask", line: "I can read the names of your chats and when each was last active, never what was said." });
    assert.deepEqual(r.groups, []);
    assert.equal(r.source, undefined);
  }
});

test("WhatsApp: chat names and last dates, a nameless chat named from ContactsV2; no status, no removed chat, no text", () => {
  const r = read("whatsapp", homes.apps, ["--chats", "names"]);
  shape(r, "whatsapp");
  assert.equal(r.ok, true);
  assert.deepEqual(r.groups.map((g) => [g.name, g.kind]), [["WhatsApp", "chat"]]);
  assert.deepEqual(titles(r), ["LA245 studio group", "Tamsin Arlo", "Corin Vale"]);
  assert.equal(days(items(r)[1].at), -3);
  noSecrets(r);
  assert.ok(!/whatsapp\.net|g\.us|555/.test(JSON.stringify(r)), "an id or a number leaked");
});

test("Messages: display names, else the handle; last dates from nanoseconds; never text", () => {
  const r = read("messages", homes.apps, ["--chats", "names"]);
  shape(r, "messages");
  assert.equal(r.ok, true);
  assert.deepEqual(titles(r), ["Studio carpool", "+15550000004"]);
  assert.equal(days(items(r)[0].at), -2);
  assert.equal(days(items(r)[1].at), -8);
  noSecrets(r);
  assert.ok(!JSON.stringify(r).includes("on my way"));
});

test("WeChat: there, it is locked (never opened); not there, missing", () => {
  for (const h of [homes.apps, homes.wechat]) {
    const r = read("wechat", h);
    shape(r, "wechat");
    assert.deepEqual(r.need, { kind: "encrypted", line: "WeChat keeps its messages locked; a file from it works" });
  }
  // only the group container
  const g = path.join(work, "wechat-group");
  fs.mkdirSync(path.join(g, "Library/Group Containers/5A4RE8SF68.com.tencent.xinWeChat"), { recursive: true });
  assert.equal(read("wechat", g).need.kind, "encrypted");
  assert.equal(read("wechat", homes.linux).need.kind, "missing");
});

test("everything present: the browsers' home and every store read; the home is not touched", () => {
  const snap = (dir) => { const out = []; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (p.endsWith("Library/Safari")) continue; if (e.isDirectory()) walk(p); else { const s = fs.statSync(p); out.push(`${p} ${s.size} ${s.mtimeMs}`); } } }; walk(dir); return out.sort().join("\n"); };
  const before = snap(homes.all);
  for (const s of ["notes", "calendar", "whatsapp", "messages"]) assert.equal(read(s, homes.all, ["--chats", "names"]).ok, true, s);
  assert.equal(read("wechat", homes.all).need.kind, "encrypted");
  assert.equal(snap(homes.all), before, "the reader changed the home");
});

test("WeChat only: every other store is missing, named plainly", () => {
  const lines = {};
  for (const s of ["notes", "calendar", "whatsapp", "messages"]) {
    const r = read(s, homes.wechat, ["--chats", "names"]);
    shape(r, s);
    assert.equal(r.need.kind, "missing");
    lines[s] = r.need.line;
  }
  assert.deepEqual(lines, { notes: "Notes is not on this Mac", calendar: "Calendar is not on this Mac", whatsapp: "WhatsApp is not on this Mac", messages: "Messages is not on this Mac" });
});

test("nothing granted (chmod 000): each readable store says Sol needs a switch, no crash", () => {
  if (root) return;
  for (const s of ["notes", "calendar", "whatsapp", "messages"]) {
    const r = read(s, homes.closed, ["--chats", "names"]);
    shape(r, s);
    assert.deepEqual(r.need, { kind: "switch", line: "Sol needs a switch" }, s);
  }
  // WeChat is never opened: that it is there shows without the grant, and it is locked either way
  assert.equal(read("wechat", homes.closed).need.kind, "encrypted");
});

test("--from: Sol's copy is read first; a closed home with a copy is read through Sol", () => {
  if (root) return;
  const from = path.join(work, "from");
  writeNotes(from, Math.floor(Date.now() / 1000));
  const r = read("notes", homes.closed, ["--from", from]);
  assert.equal(r.ok, true);
  assert.equal(r.source, "Library/Group Containers/group.com.apple.notes/NoteStore.sqlite");
  // no copy there: the home, closed
  assert.equal(read("calendar", homes.closed, ["--from", from]).need.kind, "switch");
});

test("a format with a missing column: format, the reason in note, no crash", () => {
  const r = read("notes", homes.format);
  shape(r, "notes");
  assert.equal(r.ok, false);
  assert.deepEqual(r.need, { kind: "format", line: "I could not read Notes' store on this Mac" });
  assert.match(r.note, /ZTITLE/);
  // a file that is not sqlite at all
  const h = path.join(work, "torn");
  fs.mkdirSync(path.join(h, "Library/Messages"), { recursive: true });
  fs.writeFileSync(path.join(h, "Library/Messages/chat.db"), "this is not sqlite");
  const m = read("messages", h, ["--chats", "names"]);
  assert.deepEqual(m.need, { kind: "format", line: "I could not read Messages' store on this Mac" });
  assert.ok(m.note);
  // a table missing altogether
  const w = path.join(work, "wa-other");
  const dir = path.join(w, "Library/Group Containers/group.net.whatsapp.WhatsApp.shared");
  fs.mkdirSync(dir, { recursive: true });
  execFileSync(process.execPath, ["-e", `const {DatabaseSync}=require("node:sqlite");const d=new DatabaseSync(${JSON.stringify(path.join(dir, "ChatStorage.sqlite"))});d.exec("CREATE TABLE ZOTHER(Z_PK INTEGER)");d.close()`]);
  const wr = read("whatsapp", w, ["--chats", "names"]);
  assert.equal(wr.need.line, "I could not read WhatsApp's store on this Mac");
  assert.match(wr.note, /ZWACHATSESSION/);
});

test("Linux and Windows homes: every store is missing; no reader is pretended", () => {
  for (const h of [homes.linux, homes.windows]) {
    for (const s of ["notes", "calendar", "whatsapp", "messages", "wechat"]) {
      const r = read(s, h, ["--chats", "names"]);
      shape(r, s);
      assert.equal(r.ok, false);
      assert.equal(r.need.kind, "missing", `${s} on ${h}`);
      assert.deepEqual(r.groups, []);
    }
  }
});

test("the real home off a Mac is missing without a look", () => {
  if (process.platform === "darwin") return;
  const out = path.join(work, "real.json");
  execFileSync(process.execPath, [READ, "--store", "notes", "--out", out], { encoding: "utf8" });
  const r = JSON.parse(fs.readFileSync(out, "utf8"));
  assert.equal(r.need.kind, "missing");
  assert.match(r.note, /no reader/);
});

test("writes only --out; its temp dir is gone", () => {
  const before = fs.readdirSync(os.tmpdir()).filter((d) => d.startsWith("sol-read-") && !d.startsWith("sol-read-test-"));
  read("notes", homes.apps);
  read("whatsapp", homes.apps, ["--chats", "names"]);
  const after = fs.readdirSync(os.tmpdir()).filter((d) => d.startsWith("sol-read-") && !d.startsWith("sol-read-test-"));
  assert.deepEqual(after, before);
});

// ---------- the ways already signed in (gog, gh) and the browsers' history (#1071, ways.ts) ----------
/** made-up tools in a folder of their own: gog and gh that answer as the real ones do, or as a lapsed sign-in */
function tools(name, lapsed) {
  const dir = path.join(work, `bin-${name}`);
  fs.mkdirSync(dir, { recursive: true });
  const day = new Date(Date.now() - 3 * 864e5).toISOString();
  const gog = lapsed
    ? `#!/bin/sh\nif [ "$1" = auth ]; then printf 'someone@school.example\\tdefault\\tgmail,drive\\t2026-04-14\\toauth\\n'; exit 0; fi\necho 'Get "https://x": oauth2: "invalid_grant" "Bad Request"' >&2; exit 1\n`
    : `#!/bin/sh\ncase "$1 $2" in\n "auth list") printf 'someone@school.example\\tdefault\\tgmail,drive\\t2026-04-14\\toauth\\n';;\n "gmail search") echo '{"threads":[{"id":"1","subject":"Midterm moved to Friday","date":"${day}","snippet":"${SECRET}"},{"id":"2","subject":"","date":"${day}"}]}';;\n "drive ls") echo '{"files":[{"name":"Essay draft","mimeType":"application/vnd.google-apps.document","modifiedTime":"${day}"},{"name":"Class 101","mimeType":"application/vnd.google-apps.folder","modifiedTime":"${day}"},{"name":"photo.jpg","mimeType":"image/jpeg","modifiedTime":"${day}"}]}';;\n *) exit 3;;\nesac\n`;
  const gh = lapsed
    ? `#!/bin/sh\necho 'You are not logged into any GitHub hosts. To log in, run: gh auth login' >&2; exit 1\n`
    : `#!/bin/sh\ncase "$1 $2" in\n "auth status") echo ok;;\n "repo list") echo '[{"name":"thesis","updatedAt":"${day}"}]';;\n "search issues") echo '[{"title":"Fix the figures","updatedAt":"${day}"}]';;\n *) exit 3;;\nesac\n`;
  for (const [n, body] of [["gog", gog], ["gh", gh]]) { fs.writeFileSync(path.join(dir, n), body); fs.chmodSync(path.join(dir, n), 0o755); }
  return dir;
}

test("gmail and gdrive through a signed-in gog: subjects, names and dates, never a message's text", () => {
  const bin = tools("ok", false);
  const m = read("gmail", homes.apps, ["--bin", bin]);
  assert.equal(m.ok, true); assert.equal(m.source, "gog");
  assert.deepEqual(m.groups.map((g) => g.items.map((i) => i.title)), [["Midterm moved to Friday"]]);
  assert.ok(m.groups[0].items[0].at);
  assert.ok(!JSON.stringify(m).includes(SECRET));
  const d = read("gdrive", homes.apps, ["--bin", bin]);
  assert.equal(d.ok, true);
  assert.deepEqual(d.groups.map((g) => [g.name, g.items.map((i) => i.title)]), [["Documents", ["Essay draft"]], ["Folders", ["Class 101"]], ["Files", ["photo.jpg"]]]);
});

test("a lapsed sign-in is one line, sign in once, with the tool's own command; no tool is missing", () => {
  const bin = tools("lapsed", true);
  for (const s of ["gmail", "gdrive"]) {
    const r = read(s, homes.apps, ["--bin", bin]);
    assert.equal(r.ok, false); assert.equal(r.need.kind, "once");
    assert.equal(r.need.line, "sign in to Google once");
    assert.equal(r.need.run, "gog auth add someone@school.example --services gmail,drive");
  }
  const g = read("github", homes.apps, ["--bin", bin]);
  assert.equal(g.need.kind, "once"); assert.equal(g.need.run, "gh auth login --web");
  const none = path.join(work, "bin-none"); fs.mkdirSync(none, { recursive: true });
  for (const s of ["gmail", "gdrive", "github"]) assert.equal(read(s, homes.apps, ["--bin", none]).need.kind, "missing");
});

test("github through a signed-in gh: repositories and open issues, names and dates", () => {
  const r = read("github", homes.apps, ["--bin", tools("ok", false)]);
  assert.equal(r.ok, true); assert.equal(r.source, "gh");
  assert.deepEqual(r.groups.map((g) => [g.name, g.items.map((i) => i.title)]), [["Repositories", ["thesis"]], ["Open issues and pull requests", ["Fix the figures"]]]);
});

test("history: the titles of the pages of the hosts asked for, newest first; the site's bare name and other sites left out", () => {
  const home = path.join(work, "history");
  const now = Math.floor(Date.now() / 1000);
  writeChromeProfile(path.join(home, "Library/Application Support/Google/Chrome/Default"), [
    { url: "https://www.youtube.com/watch?v=1", title: "How cells divide - YouTube", t: now - 5 * 86400 },
    { url: "https://www.youtube.com/watch?v=2", title: "Organic chemistry, lesson 4 - YouTube", t: now - 86400 },
    { url: "https://www.youtube.com/", title: "YouTube", t: now - 3600 },
    { url: "https://www.youtube.com/old", title: "Long ago", t: now - 400 * 86400 },
    { url: "https://elsewhere.example/a", title: "Not asked for", t: now - 3600 },
  ], []);
  const r = read("history", home, ["--hosts", "youtube.com"]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.groups.map((g) => [g.name, g.items.map((i) => i.title)]), [["youtube.com", ["Organic chemistry, lesson 4 - YouTube", "How cells divide - YouTube"]]]);
  assert.equal(read("history", homes.linux, ["--hosts", "youtube.com"]).need.kind, "missing");
  assert.equal(read("history", home, []).need.kind, "missing");
});
