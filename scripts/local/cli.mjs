// One-command local dev environment: node scripts/local/cli.mjs <up|stop|reset|status> [flags]. See docs/desarrollo-local.md.
import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import {
  CONTAINER_NAME, DEFAULT_API_PORT, DEFAULT_PG_PORT, DEFAULT_WEB_PORT, DUMP_DB, LABEL_KEY, LABEL_VALUE, PG_USER, POSTGRES_IMAGE, SYNTHETIC_DB, VOLUME_NAME,
  buildAppEnv, buildBaseEnv, buildDatabaseUrl, buildSeedEnv, checkContainerOwnership, detectDumpFormat, generateJwtSecret, isOwnedDatabase, isOwnedVolume,
  isValidJwtSecret, parseArgs, pickFreePort, redactUrl, resolveDataMode, validateDumpPath,
} from "./lib.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const stateFile = path.join(repoRoot, ".local", "dev.json");
const baseEnv = buildBaseEnv({ parentEnv: process.env });
const startedAt = Date.now();
const elapsed = () => `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
const log = (message) => console.log(`[local +${elapsed()}] ${message}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs a command and resolves with its output; never rejects on non-zero exit. */
function run(command, args, { timeout = 60_000, env = baseEnv, input } = {}) {
  return new Promise((resolve) => {
    const child = execFile(command, args, { timeout, env, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ code: error ? (typeof error.code === "number" ? error.code : 1) : 0, stdout: String(stdout), stderr: String(stderr) });
    });
    if (input !== undefined) child.stdin.end(input);
  });
}
const docker = (args, options) => run("docker", args, options);

/** Runs a node script with an explicit env, streaming its output. */
function runStreaming(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: repoRoot, env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`))));
  });
}

async function readState() {
  try { return JSON.parse(await readFile(stateFile, "utf8")); } catch { return {}; }
}
async function writeState(patch) {
  const next = { ...(await readState()), ...patch };
  await mkdir(path.dirname(stateFile), { recursive: true });
  await writeFile(stateFile, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  return next;
}

const isPortFree = (port) => new Promise((resolve) => {
  const probe = net.createServer();
  probe.once("error", () => resolve(false));
  probe.listen(port, () => probe.close(() => resolve(true)));
});

// Guards against a recycled pid: the recorded process must still look like our npm run.
const isAlive = (pid) => {
  try { process.kill(pid, 0); } catch { return false; }
  try { return /npm/.test(readFileSync(`/proc//cmdline`, "utf8")); } catch { return true; }
};

// ---- Docker container (the only one we own) ----

async function inspectContainer() {
  const result = await docker(["inspect", CONTAINER_NAME], { timeout: 15_000 });
  if (result.code !== 0) return null;
  const [info] = JSON.parse(result.stdout);
  const guard = checkContainerOwnership({ name: info.Name.replace(/^\//, ""), labels: info.Config?.Labels });
  if (!guard.ok) throw new Error(guard.reason);
  const networks = Object.values(info.NetworkSettings?.Networks ?? {});
  const ip = networks.map((network) => network.IPAddress).find(Boolean) ?? null;
  const published = info.NetworkSettings?.Ports?.["5432/tcp"]?.[0]?.HostPort;
  return { running: Boolean(info.State?.Running), ip, publishedPort: published ? Number(published) : null };
}

async function ensureContainer() {
  let info = await inspectContainer();
  if (!info) {
    const image = await docker(["image", "inspect", POSTGRES_IMAGE], { timeout: 15_000 });
    if (image.code !== 0) {
      log(`Image ${POSTGRES_IMAGE} missing, pulling`);
      const pull = await docker(["pull", POSTGRES_IMAGE], { timeout: 300_000 });
      if (pull.code !== 0) throw new Error(`docker pull failed: ${pull.stderr.trim()}`);
    }
    const pgPort = await pickFreePort({ start: DEFAULT_PG_PORT, isFree: isPortFree });
    log(`Creating container ${CONTAINER_NAME} (published 127.0.0.1:${pgPort})`);
    // fsync off: this is a disposable dev database, and it makes the synthetic seed much faster.
    const created = await docker([
      "run", "-d", "--name", CONTAINER_NAME, "--label", `${LABEL_KEY}=${LABEL_VALUE}`,
      "-v", `${VOLUME_NAME}:/var/lib/postgresql/data`,
      "-e", `POSTGRES_USER=${PG_USER}`, "-e", "POSTGRES_PASSWORD=hospeda", "-e", `POSTGRES_DB=${SYNTHETIC_DB}`,
      "-p", `127.0.0.1:${pgPort}:5432`, POSTGRES_IMAGE,
      "postgres", "-c", "fsync=off", "-c", "synchronous_commit=off", "-c", "full_page_writes=off", "-c", "max_connections=100",
    ]);
    if (created.code !== 0) throw new Error(`docker run failed: ${created.stderr.trim()}`);
  } else if (!info.running) {
    log(`Starting container ${CONTAINER_NAME}`);
    const started = await docker(["start", CONTAINER_NAME]);
    if (started.code !== 0) throw new Error(`docker start failed: ${started.stderr.trim()}`);
  } else log(`Container ${CONTAINER_NAME} already running`);
  await waitForPgReady();
  info = await inspectContainer();
  return info;
}

async function waitForPgReady() {
  const deadline = Date.now() + 90_000;
  // -h 127.0.0.1 only answers once the real server listens (the init-time temporary server is socket-only).
  while (Date.now() < deadline) {
    const ready = await docker(["exec", CONTAINER_NAME, "pg_isready", "-h", "127.0.0.1", "-U", PG_USER, "-d", SYNTHETIC_DB], { timeout: 10_000 });
    if (ready.code === 0) return;
    await sleep(500);
  }
  throw new Error("PostgreSQL did not become ready in 90s (docker logs hospeda-crm-dev-pg)");
}

async function canConnect(url) {
  const sql = postgres(url, { max: 1, connect_timeout: 3, idle_timeout: 1 });
  try { await sql`select 1`; return true; } catch { return false; } finally { await sql.end({ timeout: 1 }).catch(() => {}); }
}

/** Probes the container IP first (host port forwarding can hang clients on some machines), then the published port. */
async function resolveEndpoint(info) {
  const candidates = [];
  if (info.ip) candidates.push({ host: info.ip, port: 5432 });
  if (info.publishedPort) candidates.push({ host: "127.0.0.1", port: info.publishedPort });
  for (const candidate of candidates) {
    if (await canConnect(buildDatabaseUrl({ ...candidate, dbName: SYNTHETIC_DB }))) return candidate;
  }
  throw new Error(`Could not connect to ${CONTAINER_NAME} via ${candidates.map((c) => `${c.host}:${c.port}`).join(" or ")}`);
}

async function psql(dbName, sqlText) {
  if (!isOwnedDatabase({ dbName }) && dbName !== "postgres") throw new Error(`Refusing to run SQL on database "${dbName}"`);
  return docker(["exec", CONTAINER_NAME, "psql", "-U", PG_USER, "-d", dbName, "-tAc", sqlText], { timeout: 120_000 });
}

async function databaseExists(dbName) {
  const result = await psql("postgres", `select 1 from pg_database where datname='${dbName}'`);
  return result.stdout.trim() === "1";
}

async function ensureDatabase(dbName) {
  if (await databaseExists(dbName)) return;
  if (!isOwnedDatabase({ dbName })) throw new Error(`Refusing to create database "${dbName}"`);
  const created = await psql("postgres", `create database ${dbName}`);
  if (created.code !== 0) throw new Error(`create database failed: ${created.stderr.trim()}`);
}

const COUNT_TABLES = ["crm_accounts", "crm_contacts", "leads", "crm_tasks", "crm_activities", "users"];

async function readCounts(url) {
  const sql = postgres(url, { max: 1, connect_timeout: 5, idle_timeout: 1 });
  const counts = {};
  try {
    for (const table of COUNT_TABLES) {
      try { counts[table] = (await sql.unsafe(`select count(*)::int as n from ${table}`))[0].n; } catch { counts[table] = null; }
    }
  } finally { await sql.end({ timeout: 1 }).catch(() => {}); }
  return counts;
}

const formatCounts = (counts) => COUNT_TABLES.map((table) => `${table}=${counts[table] ?? "n/a"}`).join("  ");

// ---- Dump restore ----

async function restoreDump({ dumpPath, fresh }) {
  const check = validateDumpPath({ dumpPath, repoRoot });
  if (!check.ok) throw new Error(check.reason);
  if (!existsSync(dumpPath)) throw new Error(`Dump not found: ${dumpPath}`);
  const exists = await databaseExists(DUMP_DB);
  if (exists && !fresh) { log(`Database ${DUMP_DB} already restored (use --fresh to restore again)`); return; }
  if (exists) {
    log(`Dropping ${DUMP_DB} (--fresh)`);
    const dropped = await psql("postgres", `drop database ${DUMP_DB} with (force)`);
    if (dropped.code !== 0) throw new Error(`drop database failed: ${dropped.stderr.trim()}`);
  }
  await ensureDatabase(DUMP_DB);
  const handle = await open(dumpPath, "r");
  const head = Buffer.alloc(5);
  await handle.read(head, 0, 5, 0);
  await handle.close();
  const format = detectDumpFormat({ head });
  log(`Restoring ${format} dump into ${DUMP_DB} (this can take a while)`);
  const copied = await docker(["cp", dumpPath, `${CONTAINER_NAME}:/tmp/restore.dump`], { timeout: 600_000 });
  if (copied.code !== 0) throw new Error(`docker cp failed: ${copied.stderr.trim()}`);
  const restore = format === "custom"
    ? await docker(["exec", CONTAINER_NAME, "pg_restore", "-U", PG_USER, "-d", DUMP_DB, "--no-owner", "--no-privileges", "/tmp/restore.dump"], { timeout: 3_600_000 })
    : await docker(["exec", CONTAINER_NAME, "psql", "-U", PG_USER, "-d", DUMP_DB, "-q", "-f", "/tmp/restore.dump"], { timeout: 3_600_000 });
  await docker(["exec", CONTAINER_NAME, "rm", "-f", "/tmp/restore.dump"]);
  if (restore.code !== 0) log(`Restore finished with warnings (exit ${restore.code}): ${restore.stderr.trim().split("\n").slice(-3).join(" | ")}`);
}

// ---- App processes ----

async function waitForHttp(url, { timeoutMs, child }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("The app process exited before becoming healthy");
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return;
    } catch { /* not up yet */ }
    await sleep(400);
  }
  throw new Error(`${url} did not answer within ${timeoutMs / 1000}s`);
}

function killGroup(pid, signal) { try { process.kill(-pid, signal); } catch { /* already gone */ } }

async function stopApp(pid) {
  if (!pid || !isAlive(pid)) return false;
  killGroup(pid, "SIGTERM");
  for (let i = 0; i < 40 && isAlive(pid); i++) await sleep(250);
  if (isAlive(pid)) killGroup(pid, "SIGKILL");
  return true;
}

// ---- Commands ----

async function commandUp(args) {
  const mode = resolveDataMode({ data: args.data });
  let state = await readState();
  if (state.appPid && isAlive(state.appPid)) throw new Error(`The app is already running (pid ${state.appPid}). Run: npm run local:stop`);

  const info = await ensureContainer();
  const endpoint = await resolveEndpoint(info);
  log(`Database reachable at ${endpoint.host}:${endpoint.port}`);
  if (args.data.kind === "dump") await restoreDump({ dumpPath: args.data.path, fresh: args.fresh });
  else await ensureDatabase(mode.dbName);
  const databaseUrl = buildDatabaseUrl({ ...endpoint, dbName: mode.dbName });

  log("Running migrations");
  await runStreaming("node", ["scripts/migrate.mjs"], { ...baseEnv, DATABASE_URL: databaseUrl });

  let counts = await readCounts(databaseUrl);
  if (mode.seed && counts.crm_accounts === 0) {
    const seedEnv = buildSeedEnv({ baseEnv, databaseUrl, host: endpoint.host });
    log("Database is empty: seeding test user + business (admin@example.com)");
    await runStreaming("node", ["scripts/seed-test.mjs"], seedEnv);
    log("Seeding synthetic dataset (~3.5k businesses, 50k activities). This takes a few minutes.");
    await runStreaming("node", ["scripts/perf/seed-synthetic.mjs"], seedEnv);
    counts = await readCounts(databaseUrl);
  } else if (mode.seed) log("Database already has data: skipping seed");
  else log("Dump mode: seeding is disabled");

  const jwtSecret = isValidJwtSecret({ secret: state.jwtSecret }) ? state.jwtSecret : generateJwtSecret({ randomBytes });
  const apiPort = await pickFreePort({ start: DEFAULT_API_PORT, isFree: isPortFree });
  const webPort = await pickFreePort({ start: DEFAULT_WEB_PORT, isFree: isPortFree, exclude: [apiPort] });
  state = await writeState({ jwtSecret, apiPort, webPort, pgPort: info.publishedPort, mode: args.built ? "built" : "dev", dataKind: args.data.kind, dbName: mode.dbName, appPid: null });

  const appEnv = buildAppEnv({ baseEnv, built: args.built, databaseUrl, jwtSecret, apiPort, webPort });
  if (args.built) {
    log("Building (vite build + tsup)");
    await runStreaming("npm", ["run", "build"], { ...baseEnv });
  }
  log(args.built ? "Starting production-like server" : "Starting vite + API (watch mode)");
  const child = spawn("npm", ["run", args.built ? "start" : "dev"], { cwd: repoRoot, env: appEnv, stdio: "inherit", detached: true });
  await writeState({ appPid: child.pid });

  let stopping = false;
  const shutdown = async (signal) => {
    if (stopping) return;
    stopping = true;
    log(`${signal} received: stopping the app (the database container keeps running)`);
    await stopApp(child.pid);
    await writeState({ appPid: null });
    process.exit(0);
  };
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => void shutdown(signal));
  child.on("exit", async (code) => { if (!stopping) { await writeState({ appPid: null }); process.exit(code ?? 1); } });

  try {
    await waitForHttp(`http://localhost:${apiPort}/_api/health`, { timeoutMs: 120_000, child });
    if (!args.built) await waitForHttp(`http://localhost:${webPort}/`, { timeoutMs: 60_000, child });
  } catch (error) {
    await stopApp(child.pid);
    await writeState({ appPid: null });
    throw error;
  }

  const appUrl = args.built ? `http://localhost:${apiPort}` : `http://localhost:${webPort}`;
  const lines = [
    "", "=".repeat(64), " Hospeda CRM local environment is up", "=".repeat(64),
    ` App URL      : ${appUrl}${args.built ? "  (production-like build)" : "  (vite dev, API proxied)"}`,
    ` API health   : http://localhost:${apiPort}/_api/health`,
    ` Database     : ${redactUrl({ url: databaseUrl })}   (password: hospeda)`,
    ` Data mode    : ${args.data.kind === "dump" ? "REAL DATA DUMP" : "synthetic seed"} (db ${mode.dbName})`,
    ` Row counts   : ${formatCounts(counts)}`,
    ` Ready in     : ${elapsed()}`,
  ];
  if (mode.realData) lines.push(" WARNING      : this database contains REAL personal data. Login is with REAL users; no seed was applied.");
  else lines.push(" Login        : admin@example.com / test-password-123");
  lines.push(" Stop         : Ctrl+C (container stays up) or npm run local:stop", "");
  console.log(lines.join("\n"));
}

async function commandStop() {
  const state = await readState();
  const stoppedApp = await stopApp(state.appPid);
  await writeState({ appPid: null });
  log(stoppedApp ? `Stopped app (pid ${state.appPid})` : "No app process of ours was running");
  const info = await inspectContainer();
  if (!info) return log(`Container ${CONTAINER_NAME} does not exist`);
  if (!info.running) return log(`Container ${CONTAINER_NAME} already stopped`);
  const stopped = await docker(["stop", CONTAINER_NAME], { timeout: 60_000 });
  if (stopped.code !== 0) throw new Error(`docker stop failed: ${stopped.stderr.trim()}`);
  log(`Stopped container ${CONTAINER_NAME} (data kept in volume ${VOLUME_NAME})`);
}

async function commandReset(args) {
  if (!args.yes) throw new Error("local:reset deletes the dev container and ALL its data. Re-run with --yes: npm run local:reset -- --yes");
  const state = await readState();
  await stopApp(state.appPid);
  await writeState({ appPid: null });
  const info = await inspectContainer(); // throws if a container with our name is not ours
  if (info) {
    log(`Removing container ${CONTAINER_NAME}`);
    const removed = await docker(["rm", "-f", CONTAINER_NAME]);
    if (removed.code !== 0) throw new Error(`docker rm failed: ${removed.stderr.trim()}`);
  }
  if (isOwnedVolume({ name: VOLUME_NAME })) {
    const volume = await docker(["volume", "inspect", VOLUME_NAME], { timeout: 15_000 });
    if (volume.code === 0) {
      log(`Removing volume ${VOLUME_NAME}`);
      const removed = await docker(["volume", "rm", VOLUME_NAME]);
      if (removed.code !== 0) throw new Error(`docker volume rm failed: ${removed.stderr.trim()}`);
    }
  }
  await commandUp({ ...args, command: "up", fresh: false });
}

async function commandStatus() {
  const state = await readState();
  const info = await inspectContainer();
  console.log(`Container ${CONTAINER_NAME}: ${info ? (info.running ? "running" : "stopped") : "does not exist"}`);
  if (info?.running) {
    const endpoint = await resolveEndpoint(info).catch(() => null);
    if (!endpoint) console.log("Database: container running but no connection worked");
    else {
      for (const dbName of [SYNTHETIC_DB, DUMP_DB]) {
        if (!(await databaseExists(dbName))) continue;
        const url = buildDatabaseUrl({ ...endpoint, dbName });
        console.log(`Database ${dbName}: ${redactUrl({ url })}\n  ${formatCounts(await readCounts(url))}`);
      }
    }
  }
  const appRunning = Boolean(state.appPid && isAlive(state.appPid));
  console.log(`App process: ${appRunning ? `running (pid ${state.appPid}, ${state.mode}, ${state.dataKind})` : "not running"}`);
  const endpoints = [["API", state.apiPort, "/_api/health"], ...(state.mode === "built" ? [] : [["Web", state.webPort, "/"]])];
  for (const [label, port, url] of endpoints) {
    if (!port) continue;
    const answered = await fetch(`http://localhost:${port}${url}`, { signal: AbortSignal.timeout(2000) }).then((r) => r.ok).catch(() => false);
    console.log(`${label} port ${port}: ${answered ? "answers" : "no answer"}`);
  }
}

async function main() {
  const args = parseArgs({ argv: process.argv.slice(2) });
  if (args.command === "up") await commandUp(args);
  else if (args.command === "stop") await commandStop();
  else if (args.command === "reset") await commandReset(args);
  else await commandStatus();
  if (args.command !== "up") process.exit(0);
}

main().catch((error) => {
  console.error(`\n[local] ERROR: ${error.message}`);
  process.exit(1);
});
