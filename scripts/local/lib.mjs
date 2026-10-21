// Pure helpers for the local dev environment (scripts/local/cli.mjs). No I/O here so everything is unit-testable.
import path from "node:path";

/** Container, volume and label owned by the local dev tooling. Nothing else is ever touched. */
export const CONTAINER_NAME = "hospeda-crm-dev-pg";
export const VOLUME_NAME = "hospeda-crm-dev-pgdata";
export const LABEL_KEY = "hospeda-crm.dev";
export const LABEL_VALUE = "1";
export const POSTGRES_IMAGE = "postgres:17-alpine";
export const PG_USER = "hospeda";
export const PG_PASSWORD = "hospeda";
export const SYNTHETIC_DB = "hospeda_leads";
export const DUMP_DB = "hospeda_dump";
export const DUMP_TMP_DB = "hospeda_dump_tmp";
export const SEED_MARKER = "hospeda-crm.dev seed=complete";
export const DEFAULT_API_PORT = 3001;
export const DEFAULT_WEB_PORT = 5173;
export const DEFAULT_PG_PORT = 5433;
export const COMMANDS = ["up", "stop", "reset", "status"];

/**
 * Parses CLI arguments. Throws on anything unknown so typos never silently change behaviour.
 * @param {{argv: readonly string[]}} input argv WITHOUT node and script path: [command, ...flags].
 * @returns {{command: string, built: boolean, yes: boolean, fresh: boolean, data: {kind: "synthetic"} | {kind: "dump", path: string}}}
 */
export function parseArgs({ argv }) {
  const [command = "up", ...flags] = argv;
  if (!COMMANDS.includes(command)) throw new Error(`Unknown command "${command}". Expected one of: ${COMMANDS.join(", ")}`);
  const result = { command, built: false, yes: false, fresh: false, data: { kind: "synthetic" } };
  for (const flag of flags) {
    if (flag === "--built") result.built = true;
    else if (flag === "--yes") result.yes = true;
    else if (flag === "--fresh") result.fresh = true;
    else if (flag === "--data=synthetic") result.data = { kind: "synthetic" };
    else if (flag.startsWith("--data=dump:")) {
      const dumpPath = flag.slice("--data=dump:".length);
      if (!dumpPath) throw new Error("--data=dump: requires an absolute path");
      result.data = { kind: "dump", path: dumpPath };
    } else if (flag.startsWith("--data=")) throw new Error(`Invalid --data value "${flag.slice(7)}". Use synthetic or dump:/abs/path`);
    else throw new Error(`Unknown flag "${flag}"`);
  }
  if (result.fresh && result.data.kind !== "dump") throw new Error("--fresh only applies to --data=dump:<path>");
  return result;
}

/**
 * Finds the first free port starting at `start`.
 * @param {{start: number, isFree: (port: number) => Promise<boolean>, exclude?: readonly number[], limit?: number}} input
 * @returns {Promise<number>}
 */
export async function pickFreePort({ start, isFree, exclude = [], limit = 100 }) {
  for (let port = start; port < start + limit; port++) {
    if (exclude.includes(port)) continue;
    if (await isFree(port)) return port;
  }
  throw new Error(`No free port found in ${start}-${start + limit - 1}`);
}

/**
 * Database name and flags for a data mode.
 * @param {{data: {kind: "synthetic"} | {kind: "dump", path: string}}} input
 * @returns {{dbName: string, seed: boolean, realData: boolean}}
 */
export function resolveDataMode({ data }) {
  if (data.kind === "dump") return { dbName: DUMP_DB, seed: false, realData: true };
  return { dbName: SYNTHETIC_DB, seed: true, realData: false };
}

/**
 * Validates an owner-provided dump path: absolute and never inside the repo (dumps hold real personal data).
 * Symlinks are resolved first (via the injected `realpath`) so a link pointing into the repo is caught too.
 * @param {{dumpPath: string, repoRoot: string, realpath?: (p: string) => string}} input
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
export function validateDumpPath({ dumpPath, repoRoot, realpath = (p) => p }) {
  if (!path.isAbsolute(dumpPath)) return { ok: false, reason: "The dump path must be absolute" };
  const resolved = path.resolve(realpath(path.resolve(dumpPath)));
  const relative = path.relative(path.resolve(realpath(path.resolve(repoRoot))), resolved);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return { ok: false, reason: "Refusing a dump inside the repository: keep real data outside Git" };
  }
  return { ok: true };
}

/**
 * Detects the dump format from the first bytes of the file. Only "custom" (pg_dump -Fc) is accepted by the tooling:
 * plain SQL can contain \connect and write into other databases.
 * @param {{head: Uint8Array}} input
 * @returns {"custom" | "plain"}
 */
export function detectDumpFormat({ head }) {
  const magic = Buffer.from(head.slice(0, 5)).toString("latin1");
  return magic === "PGDMP" ? "custom" : "plain";
}

/** Message shown when a dump is not custom format. */
export const CUSTOM_DUMP_REQUIRED = "Only custom-format dumps are accepted. Create it with: pg_dump -Fc --no-owner --no-acl <db> > file.dump";

/**
 * Builds the COMMENT stored on the restored database to remember its source file.
 * @param {{source: string, mtimeMs: number}} input
 * @returns {string}
 */
export function formatDumpComment({ source, mtimeMs }) {
  return `hospeda-crm.dev dump ${JSON.stringify({ source, mtimeMs: Math.floor(mtimeMs) })}`;
}

/**
 * Parses a comment built by formatDumpComment.
 * @param {{comment: string | null | undefined}} input
 * @returns {{source: string, mtimeMs: number} | null}
 */
export function parseDumpComment({ comment }) {
  const prefix = "hospeda-crm.dev dump ";
  if (!comment?.startsWith(prefix)) return null;
  try {
    const value = JSON.parse(comment.slice(prefix.length));
    return typeof value.source === "string" && typeof value.mtimeMs === "number" ? value : null;
  } catch { return null; }
}

/**
 * Decides which seeds still have to run.
 * @param {{marker: string | null | undefined, accounts: number | null, perfRows: number | null}} input
 * @returns {{testSeed: boolean, perfSeed: boolean, complete: boolean}}
 */
export function planSeeding({ marker, accounts, perfRows }) {
  if (marker === SEED_MARKER) return { testSeed: false, perfSeed: false, complete: true };
  return { testSeed: (accounts ?? 0) === 0, perfSeed: (perfRows ?? 0) === 0, complete: false };
}

/**
 * Parses /proc/<pid>/stat. The comm field may contain spaces and parentheses, so fields are read after the LAST ")".
 * @param {{stat: string}} input
 * @returns {{pgid: number, startTime: string} | null}
 */
export function parseProcStat({ stat }) {
  const end = stat.lastIndexOf(")");
  if (end < 0) return null;
  const fields = stat.slice(end + 1).trim().split(/\s+/); // fields[0] is field 3 (state)
  const pgid = Number(fields[2]); // field 5
  const startTime = fields[19]; // field 22
  return Number.isInteger(pgid) && startTime ? { pgid, startTime } : null;
}

/**
 * Process identity: pid, start time and process group must all match what was recorded. Fails CLOSED on any read problem.
 * @param {{recorded: {pid?: number, startTime?: string, pgid?: number} | null | undefined, readStat: (pid: number) => string | null}} input
 * @returns {boolean}
 */
export function isSameProcess({ recorded, readStat }) {
  if (!recorded?.pid || !recorded.startTime || !recorded.pgid) return false;
  let stat;
  try { stat = readStat(recorded.pid); } catch { return false; }
  if (!stat) return false;
  const parsed = parseProcStat({ stat });
  return parsed !== null && parsed.startTime === recorded.startTime && parsed.pgid === recorded.pgid;
}

/**
 * Extracts listening pids from `ss -ltnp` output.
 * @param {{output: string}} input
 * @returns {number[]}
 */
export function parseSsPids({ output }) {
  return [...output.matchAll(/pid=(\d+)/g)].map((match) => Number(match[1]));
}

/**
 * Environment for docker CLI calls only (never given to the app).
 * @param {{parentEnv: Record<string, string | undefined>}} input
 * @returns {Record<string, string>}
 */
export function buildDockerEnv({ parentEnv }) {
  const env = buildBaseEnv({ parentEnv });
  for (const key of ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG"]) if (parentEnv[key] !== undefined) env[key] = parentEnv[key];
  return env;
}

/**
 * Builds a Postgres URL for the dev container.
 * @param {{host: string, port: number, dbName: string}} input
 * @returns {string}
 */
export function buildDatabaseUrl({ host, port, dbName }) {
  return `postgres://${PG_USER}:${PG_PASSWORD}@${host}:${port}/${dbName}`;
}

/** Masks the password of a connection string for display. */
export function redactUrl({ url }) {
  return url.replace(/:\/\/([^:]+):[^@]*@/, "://$1:***@");
}

/** Lowercase substrings that mark a JWT secret as an example value. Keep identical to `PlaceholderMarkers` in src/helpers/getSetServerSession.tsx (a unit test asserts it). */
export const JwtPlaceholderMarkers = ["change-me", "changeme", "not-for-production", "example", "replace", "placeholder", "secret-here", "your-secret", "your_secret", "yoursecret"];

/**
 * Checks a JWT secret: at least 32 chars and not an obvious placeholder.
 * @param {{secret: string | undefined}} input
 * @returns {boolean}
 */
export function isValidJwtSecret({ secret }) {
  if (!secret || secret.length < 32) return false;
  const lower = secret.toLowerCase();
  return !JwtPlaceholderMarkers.some((marker) => lower.includes(marker));
}

/**
 * Generates a 64-hex-char JWT secret.
 * @param {{randomBytes: (size: number) => Buffer}} input
 * @returns {string}
 */
export function generateJwtSecret({ randomBytes }) {
  return randomBytes(32).toString("hex");
}

const PARENT_ENV_ALLOWLIST = ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "LANG", "LC_ALL", "TERM", "TMPDIR", "TZ", "COLORTERM", "FORCE_COLOR", "NO_COLOR", "XDG_RUNTIME_DIR"];

/**
 * Whitelisted subset of the parent environment. DATABASE_URL and every secret are deliberately dropped.
 * @param {{parentEnv: Record<string, string | undefined>}} input
 * @returns {Record<string, string>}
 */
export function buildBaseEnv({ parentEnv }) {
  const env = {};
  for (const key of PARENT_ENV_ALLOWLIST) if (parentEnv[key] !== undefined) env[key] = parentEnv[key];
  return env;
}

/**
 * Environment for the app processes, generated in-process (no dotenv file is ever read).
 * Dev mode: the browser talks to Vite, so PUBLIC_APP_URL (Origin guard) is the web URL.
 * Built mode: the API serves the SPA itself, so it is the API URL.
 * @param {{baseEnv: Record<string, string>, built: boolean, databaseUrl: string, jwtSecret: string, apiPort: number, webPort: number}} input
 * @returns {Record<string, string>}
 */
export function buildAppEnv({ baseEnv, built, databaseUrl, jwtSecret, apiPort, webPort }) {
  return {
    ...baseEnv,
    NODE_ENV: built ? "production" : "development",
    DATABASE_URL: databaseUrl,
    JWT_SECRET: jwtSecret,
    ADMIN_EMAIL: "admin@example.com",
    BREVO_API_KEY: "",
    PORT: String(apiPort),
    PUBLIC_APP_URL: built ? `http://localhost:${apiPort}` : `http://localhost:${webPort}`,
    CRM_DEV_API_URL: `http://localhost:${apiPort}`,
    CRM_DEV_WEB_PORT: String(webPort),
  };
}

/**
 * Environment for seed scripts. CRM_PERF_ALLOW_HOST lets the synthetic seed accept the container IP.
 * @param {{baseEnv: Record<string, string>, databaseUrl: string, host: string}} input
 * @returns {Record<string, string>}
 */
export function buildSeedEnv({ baseEnv, databaseUrl, host }) {
  return { ...baseEnv, DATABASE_URL: databaseUrl, CRM_TEST_DATABASE: "1", CRM_PERF_ALLOW_HOST: host };
}

/**
 * Guard: only a container with the exact owned name AND label may be managed.
 * @param {{name: string, labels: Record<string, string> | null | undefined}} input
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
export function checkContainerOwnership({ name, labels }) {
  if (name !== CONTAINER_NAME) return { ok: false, reason: `Refusing to manage container "${name}"` };
  if (!labels || labels[LABEL_KEY] !== LABEL_VALUE) return { ok: false, reason: `Container "${name}" exists without the ${LABEL_KEY}=${LABEL_VALUE} label: it is not ours` };
  return { ok: true };
}

/**
 * Guard: only the owned volume may be removed: exact name AND the label, or (legacy, unlabeled) mounted by our verified container.
 * @param {{name: string, labels?: Record<string, string> | null, mountedByOwnedContainer?: boolean}} input
 * @returns {boolean}
 */
export function isOwnedVolume({ name, labels = null, mountedByOwnedContainer = false }) {
  if (name !== VOLUME_NAME) return false;
  return labels?.[LABEL_KEY] === LABEL_VALUE || mountedByOwnedContainer;
}

/**
 * Guard: only the owned database names may be created/dropped.
 * @param {{dbName: string}} input
 * @returns {boolean}
 */
export function isOwnedDatabase({ dbName }) {
  return dbName === SYNTHETIC_DB || dbName === DUMP_DB || dbName === DUMP_TMP_DB;
}
