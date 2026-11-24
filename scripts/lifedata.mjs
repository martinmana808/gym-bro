#!/usr/bin/env node
/**
 * Life data — one block per training day into Martin's Drive folder "Life data".
 *
 * The folder holds one markdown file per app; a Claude session reads the folder
 * to say how his days went. This writes `Gym-bro.md`:
 *
 *   2026-11-12 · workout: Pequeño Putarraco · day: Day 2 · at: 20:58 · duration: 57min · done: 88% · sets: 23/26
 *     - skipped exercise: Dominadas neutras (3 sets)
 *
 * It runs on this Mac under launchd, where Google Drive for desktop mounts the
 * folder as ordinary files — a plain append, no Drive API and no credential.
 *
 * The database is read ONLY: every query runs inside a `read only` transaction,
 * so a mistake in here cannot write to production.
 *
 * Usage:
 *   node scripts/lifedata.mjs --dry-run          # print the blocks, write nothing
 *   node scripts/lifedata.mjs                    # yesterday + the 7 days before it
 *   node scripts/lifedata.mjs --days 30          # the first run's backfill
 *   node scripts/lifedata.mjs --where            # print the folder this Mac resolves to
 *
 * The connection string lives in `.env.lifedata` as LIFEDATA_DATABASE_URL —
 * deliberately NOT named DATABASE_URL in a file Next.js reads, because
 * src/db/index.ts switches to that Postgres the moment DATABASE_URL exists and
 * `npm run dev` would then be editing production.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

export const SEP = " · ";
export const TZ = "America/Argentina/Buenos_Aires";
export const FILE_NAME = "Gym-bro.md";
export const FOLDER_NAME = "Life data";
/** Martin's day runs 04:00 to 03:59, so a 01:00 workout belongs to the day before. */
export const DAY_STARTS_AT_HOUR = 4;

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------- time

const parts = (date, tz = TZ) => {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const got = {};
  for (const p of f) got[p.type] = p.value;
  return got;
};

/**
 * The date of the *life day* a timestamp belongs to. Shifting the instant back
 * four hours and then reading it in Buenos Aires does the whole 04:00 rule:
 * 01:00 Wednesday becomes 21:00 Tuesday, 05:00 stays on its own day.
 */
export function lifeDate(date, tz = TZ) {
  const shifted = new Date(date.getTime() - DAY_STARTS_AT_HOUR * 3600_000);
  const p = parts(shifted, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Wall-clock HH:MM in Buenos Aires — the real time, not the shifted one. */
export function localTime(date, tz = TZ) {
  const p = parts(date, tz);
  return `${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
}

/** The instant a life day begins: 04:00 Buenos Aires on that date. */
export function dayStart(dateStr, tz = TZ) {
  // Fixed offsets would be wrong if Argentina ever brings back DST, so find the
  // offset by asking the zone what a guessed instant reads as.
  const guess = Date.parse(`${dateStr}T0${DAY_STARTS_AT_HOUR}:00:00Z`);
  const p = parts(new Date(guess), tz);
  const asRead = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);
  return new Date(guess + (guess - asRead));
}

/** Dates of the `count` closed life days ending with the one before `today`. */
export function recentDays(nowDate, count, tz = TZ) {
  const today = lifeDate(nowDate, tz);
  const out = [];
  for (let i = count; i >= 1; i--) {
    const d = new Date(dayStart(today, tz).getTime() - i * 86_400_000 + 3600_000);
    out.push(lifeDate(d, tz));
  }
  return out;
}

export const minutesOf = (ms) => Math.max(0, Math.round(ms / 60_000));

// ---------------------------------------------------------------- the block

/**
 * One session's worth of fields, in the order Martin asked for them.
 * `status: unfinished` only appears when the session was never finished — its
 * end is then the last set he logged, which is the honest guess.
 */
export function sessionFields(s) {
  const fields = [
    `workout: ${s.program}`,
    `day: ${s.day}`,
    `at: ${localTime(s.startedAt)}`,
    `duration: ${minutesOf(s.endedAt.getTime() - s.startedAt.getTime() - s.pausedMs)}min`,
    `done: ${percent(s.logged, s.planned)}%`,
    `sets: ${s.logged}/${s.planned}`,
  ];
  if (!s.finished) fields.push("status: unfinished");
  return fields;
}

export const percent = (logged, planned) =>
  planned > 0 ? Math.round((logged / planned) * 100) : 0;

/**
 * Detail lines for what the plan asked for and didn't get.
 *
 * A set counts as not done when nothing was logged against it — whether he
 * tapped skip or simply never got there. That keeps the detail lines and
 * `sets: logged/planned` telling the same story: the lines always account for
 * exactly the gap. (The skip flag only arrived in the app this week, so for
 * anything older it is the only way to see a skip at all.)
 */
export function skipLines(exercises) {
  const lines = [];
  for (const e of exercises) {
    const missing = e.sets - e.logged;
    if (missing <= 0) continue;
    if (e.logged === 0) {
      lines.push(`skipped exercise: ${e.name} (${e.sets} ${e.sets === 1 ? "set" : "sets"})`);
    } else {
      lines.push(`skipped sets: ${e.name} ${missing} of ${e.sets}`);
    }
  }
  return lines;
}

/**
 * The whole block for one date: a summary line, then detail lines.
 *
 * Two sessions in a day stay one block. The summary adds `sessions: 2` and
 * totals them; each session then gets its own detail line with the same
 * fields, followed by its own skipped lines.
 */
export function blockFor(date, sessions) {
  if (!sessions.length) return null;
  const detail = [];

  if (sessions.length === 1) {
    const [s] = sessions;
    detail.push(...skipLines(s.exercises));
    return render(date, sessionFields(s), detail);
  }

  const logged = sessions.reduce((n, s) => n + s.logged, 0);
  const planned = sessions.reduce((n, s) => n + s.planned, 0);
  const programs = [...new Set(sessions.map((s) => s.program))];
  const summary = [
    `sessions: ${sessions.length}`,
    `workout: ${programs.join(", ")}`,
    `day: ${sessions.map((s) => s.day).join(", ")}`,
    `at: ${localTime(sessions[0].startedAt)}`,
    `duration: ${sessions.reduce(
      (n, s) => n + minutesOf(s.endedAt.getTime() - s.startedAt.getTime() - s.pausedMs),
      0,
    )}min`,
    `done: ${percent(logged, planned)}%`,
    `sets: ${logged}/${planned}`,
  ];
  sessions.forEach((s, i) => {
    detail.push(`session ${i + 1}${SEP}${sessionFields(s).join(SEP)}`);
    detail.push(...skipLines(s.exercises));
  });
  return render(date, summary, detail);
}

const render = (date, fields, detail) =>
  [date + SEP + fields.join(SEP), ...detail.map((d) => `  - ${d}`)].join("\n");

// ---------------------------------------------------------------- the file

const DATED = /^(\d{4}-\d{2}-\d{2}) · /;

/**
 * Every block already in the file, in order. Append-only means a date can
 * appear several times; the reader takes the last one as true, so that is the
 * one a new run compares itself against.
 */
export function parseBlocks(text) {
  const blocks = [];
  for (const line of (text ?? "").split("\n")) {
    const dated = DATED.exec(line);
    if (dated) {
      blocks.push({ date: dated[1], lines: [line] });
    } else if (blocks.length && /^ {2}- /.test(line)) {
      blocks[blocks.length - 1].lines.push(line);
    }
  }
  return blocks.map((b) => ({ date: b.date, text: b.lines.join("\n") }));
}

export const lastBlockFor = (text, date) => {
  const mine = parseBlocks(text).filter((b) => b.date === date);
  return mine.length ? mine[mine.length - 1].text : null;
};

/** Blocks worth appending: new dates, and dates whose data has since changed. */
export function blocksToAppend(text, candidates) {
  return candidates.filter((b) => b && lastBlockFor(text, b.date) !== b.text);
}

/** Resolve the Drive folder the way TRaid's lifedata.py does. Never creates it. */
export function resolveDir(env = process.env, home = os.homedir()) {
  const explicit = (env.LIFE_DATA_DIR ?? "").trim();
  if (explicit) return { dir: explicit.replace(/^~/, home), why: null };
  const cloud = path.join(home, "Library", "CloudStorage");
  let mounts = [];
  try {
    mounts = fs
      .readdirSync(cloud)
      .filter((d) => d.startsWith("GoogleDrive-"))
      .map((d) => path.join(cloud, d, "My Drive"))
      .filter((p) => fs.existsSync(p))
      .sort();
  } catch {
    return { dir: null, why: `no ${cloud} — set LIFE_DATA_DIR` };
  }
  const existing = mounts
    .map((m) => path.join(m, FOLDER_NAME))
    .filter((p) => fs.existsSync(p));
  if (existing.length === 1) return { dir: existing[0], why: null };
  if (existing.length > 1)
    return { dir: null, why: `"${FOLDER_NAME}" in ${existing.length} Drive accounts — set LIFE_DATA_DIR` };
  return { dir: null, why: `no "${FOLDER_NAME}" folder found — set LIFE_DATA_DIR` };
}

/** Append blocks to the file, creating it with its heading if it is missing. */
export function appendBlocks(file, blocks) {
  if (!blocks.length) return 0;
  let existing = "";
  if (fs.existsSync(file)) {
    existing = fs.readFileSync(file, "utf8");
  } else {
    existing = `# ${path.basename(file, ".md")}\n\n`;
    fs.writeFileSync(file, existing, { flag: "wx" });
  }
  const lead = existing.length === 0 || existing.endsWith("\n") ? "" : "\n";
  fs.appendFileSync(file, lead + blocks.map((b) => b.text).join("\n") + "\n");
  return blocks.length;
}

// ---------------------------------------------------------------- the data

function loadUrl(env = process.env) {
  if (env.LIFEDATA_DATABASE_URL) return env.LIFEDATA_DATABASE_URL;
  const file = path.join(REPO, ".env.lifedata");
  if (!fs.existsSync(file)) return null;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = /^\s*LIFEDATA_DATABASE_URL\s*=\s*(.*)$/.exec(line);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return null;
}

/**
 * Read the sessions of the given life days, grouped by date.
 *
 * Only Martin's rows. One user in the database is him; if a second ever
 * appears (a real Google sign-in next to the dev login) this stops and says
 * so rather than quietly logging someone else's workouts.
 */
async function readDays(sql, dates) {
  const from = dayStart(dates[0]);
  const to = new Date(dayStart(dates[dates.length - 1]).getTime() + 86_400_000);

  return sql.begin("read only", async (sql) => {
    const users = await sql`select id, email from users order by email`;
    if (users.length === 0) throw new Error("no users in the database");
    let user = users[0];
    if (users.length > 1) {
      const wanted = (process.env.LIFEDATA_USER_EMAIL ?? "").trim();
      user = users.find((u) => u.email === wanted);
      if (!user)
        throw new Error(
          `${users.length} users — set LIFEDATA_USER_EMAIL to one of: ${users.map((u) => u.email).join(", ")}`,
        );
    }

    const rows = await sql`
      select s.id, s.started_at, s.finished_at, s.paused_ms,
             p.name as program, d.name as day,
             (select max(l.created_at) from set_logs l where l.session_id = s.id) as last_log_at,
             (select count(*)::int from set_logs l
               where l.session_id = s.id and l.skipped = false) as logged,
             (select coalesce(sum(e.sets), 0)::int from exercises e
               where e.variation_id = s.variation_id) as planned
        from sessions s
        join days d on d.id = s.day_id
        join programs p on p.id = d.program_id
       where s.user_id = ${user.id}
         and s.started_at >= ${from}
         and s.started_at < ${to}
       order by s.started_at`;
    if (!rows.length) return { user, byDate: new Map() };

    const perExercise = await sql`
      select s.id as session_id, e.name, e.sets,
             (select count(*)::int from set_logs l
               where l.session_id = s.id and l.exercise_id = e.id and l.skipped = false) as logged
        from sessions s
        join exercises e on e.variation_id = s.variation_id
       where s.id in ${sql(rows.map((r) => r.id))}
       order by s.id, e.position`;

    const byDate = new Map();
    for (const r of rows) {
      const finished = r.finished_at != null;
      const endedAt = r.finished_at ?? r.last_log_at;
      // Started and abandoned without logging anything is not a training day.
      if (!endedAt || (!finished && r.logged === 0)) continue;
      const date = lifeDate(r.started_at);
      const session = {
        id: r.id,
        program: r.program,
        day: r.day,
        startedAt: r.started_at,
        endedAt,
        pausedMs: r.paused_ms,
        finished,
        logged: r.logged,
        planned: r.planned,
        exercises: perExercise
          .filter((e) => e.session_id === r.id)
          .map((e) => ({ name: e.name, sets: e.sets, logged: e.logged })),
      };
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date).push(session);
    }
    return { user, byDate };
  });
}

// ---------------------------------------------------------------- the job

async function main(argv) {
  const dryRun = argv.includes("--dry-run");
  const daysArg = argv.indexOf("--days");
  const days = daysArg >= 0 ? Number(argv[daysArg + 1]) : 8;
  if (!Number.isInteger(days) || days < 1 || days > 400) {
    console.error(`[lifedata] --days must be a whole number of days, got ${argv[daysArg + 1]}`);
    return 1;
  }

  const { dir, why } = resolveDir();
  if (argv.includes("--where")) {
    console.log(dir ?? `(unresolved) ${why}`);
    return dir ? 0 : 1;
  }
  if (!dir) {
    console.error(`[lifedata] ${why} — nothing written`);
    return 1;
  }

  const url = loadUrl();
  if (!url) {
    console.error("[lifedata] no LIFEDATA_DATABASE_URL (env or .env.lifedata) — nothing written");
    return 1;
  }

  const dates = recentDays(new Date(), days);
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, { max: 1, prepare: false, idle_timeout: 5, connect_timeout: 20 });
  let data;
  try {
    data = await readDays(sql, dates);
  } finally {
    await sql.end({ timeout: 5 });
  }

  const candidates = dates
    .map((d) => {
      const block = blockFor(d, data.byDate.get(d) ?? []);
      return block ? { date: d, text: block } : null;
    })
    .filter(Boolean);

  const file = path.join(dir, FILE_NAME);
  const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const pending = blocksToAppend(existing, candidates);

  const span = `${dates[0]}..${dates[dates.length - 1]}`;
  if (!pending.length) {
    console.log(`[lifedata] ${span}: ${candidates.length} day(s) with data, all already logged`);
    return 0;
  }
  if (dryRun) {
    console.log(`[lifedata] ${span}: would append ${pending.length} block(s) to ${file}`);
    for (const b of pending) console.log(b.text);
    return 0;
  }
  appendBlocks(file, pending);
  console.log(`[lifedata] ${span}: appended ${pending.length} block(s) to ${file}`);
  for (const b of pending) console.log(b.text);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((e) => {
      // Never raise: a bad night for Drive or Neon logs a reason and stops there.
      console.error(`[lifedata] ${e?.name ?? "Error"}: ${e?.message ?? e}`);
      process.exit(1);
    });
}
