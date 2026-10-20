// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  CONTAINER_NAME, DUMP_DB, SYNTHETIC_DB, VOLUME_NAME,
  DUMP_TMP_DB, SEED_MARKER,
  buildAppEnv, buildBaseEnv, buildDatabaseUrl, buildDockerEnv, buildSeedEnv, checkContainerOwnership, detectDumpFormat, formatDumpComment, generateJwtSecret, isOwnedDatabase, isOwnedVolume,
  isSameProcess, isValidJwtSecret, parseArgs, parseDumpComment, parseProcStat, parseSsPids, pickFreePort, planSeeding, redactUrl, resolveDataMode, validateDumpPath,
} from "./lib.mjs";

describe("parseArgs", () => {
  it("defaults to up with synthetic data", () => {
    const result = parseArgs({ argv: [] });
    expect(result).toEqual({ command: "up", built: false, yes: false, fresh: false, data: { kind: "synthetic" } });
  });

  it("parses flags and a dump path", () => {
    const result = parseArgs({ argv: ["up", "--built", "--data=dump:/data/x.dump", "--fresh"] });
    expect(result).toMatchObject({ built: true, fresh: true, data: { kind: "dump", path: "/data/x.dump" } });
  });

  it("keeps colons inside the dump path", () => {
    expect(parseArgs({ argv: ["up", "--data=dump:/a:b/c.sql"] }).data).toEqual({ kind: "dump", path: "/a:b/c.sql" });
  });

  it.each([
    [["bogus"]], [["up", "--wat"]], [["up", "--data=other"]], [["up", "--data=dump:"]], [["up", "--fresh"]],
  ])("rejects invalid input %j", (argv) => {
    expect(() => parseArgs({ argv })).toThrow();
  });
});

describe("pickFreePort", () => {
  it("skips busy and excluded ports", async () => {
    const busy = new Set([3001, 3002]);
    const port = await pickFreePort({ start: 3001, isFree: async (p) => !busy.has(p), exclude: [3003] });
    expect(port).toBe(3004);
  });

  it("throws when the range is exhausted", async () => {
    await expect(pickFreePort({ start: 10, limit: 3, isFree: async () => false })).rejects.toThrow(/No free port/);
  });
});

describe("resolveDataMode", () => {
  it("uses the default database and seeds for synthetic", () => {
    expect(resolveDataMode({ data: { kind: "synthetic" } })).toEqual({ dbName: SYNTHETIC_DB, seed: true, realData: false });
  });

  it("uses a separate database and never seeds for a dump", () => {
    expect(resolveDataMode({ data: { kind: "dump", path: "/x" } })).toEqual({ dbName: DUMP_DB, seed: false, realData: true });
  });
});

describe("validateDumpPath", () => {
  const repoRoot = "/home/u/repo";

  it("accepts an absolute path outside the repo", () => {
    expect(validateDumpPath({ dumpPath: "/home/u/dumps/a.dump", repoRoot })).toEqual({ ok: true });
  });

  it("rejects relative paths", () => {
    expect(validateDumpPath({ dumpPath: "a.dump", repoRoot }).ok).toBe(false);
  });

  it.each(["/home/u/repo/a.dump", "/home/u/repo/sub/../a.dump", "/home/u/repo"])("rejects %s inside the repo", (dumpPath) => {
    expect(validateDumpPath({ dumpPath, repoRoot }).ok).toBe(false);
  });

  it("does not confuse a sibling directory sharing the prefix", () => {
    expect(validateDumpPath({ dumpPath: "/home/u/repo-other/a.dump", repoRoot }).ok).toBe(true);
  });
});

describe("detectDumpFormat", () => {
  it("detects custom format by magic", () => {
    expect(detectDumpFormat({ head: Buffer.from("PGDMP\u0001") })).toBe("custom");
  });

  it("treats anything else as plain SQL", () => {
    expect(detectDumpFormat({ head: Buffer.from("-- Pos") })).toBe("plain");
  });
});

describe("database url", () => {
  it("builds and redacts", () => {
    const url = buildDatabaseUrl({ host: "172.17.0.5", port: 5432, dbName: "hospeda_leads" });
    expect(url).toBe("postgres://hospeda:hospeda@172.17.0.5:5432/hospeda_leads");
    expect(redactUrl({ url })).toBe("postgres://hospeda:***@172.17.0.5:5432/hospeda_leads");
  });
});

describe("jwt secret", () => {
  it("generates 64 hex chars that validate", () => {
    const secret = generateJwtSecret({ randomBytes: (size) => Buffer.alloc(size, 171) });
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(isValidJwtSecret({ secret })).toBe(true);
  });

  it.each([undefined, "", "short", "x".repeat(31), "changeme-changeme-changeme-changeme-1"])("rejects %s", (secret) => {
    expect(isValidJwtSecret({ secret })).toBe(false);
  });
});

describe("environment building", () => {
  const baseEnv = buildBaseEnv({ parentEnv: { PATH: "/bin", HOME: "/h", DATABASE_URL: "postgres://prod", JWT_SECRET: "leak", BREVO_API_KEY: "real" } });

  it("drops DATABASE_URL and secrets from the parent environment", () => {
    expect(baseEnv).toEqual({ PATH: "/bin", HOME: "/h" });
  });

  it("dev mode: origin is the web URL, brevo empty", () => {
    const env = buildAppEnv({ baseEnv, built: false, databaseUrl: "postgres://x", jwtSecret: "s".repeat(64), apiPort: 3002, webPort: 5174 });
    expect(env).toMatchObject({ NODE_ENV: "development", PUBLIC_APP_URL: "http://localhost:5174", PORT: "3002", BREVO_API_KEY: "", CRM_DEV_API_URL: "http://localhost:3002", CRM_DEV_WEB_PORT: "5174", DATABASE_URL: "postgres://x" });
  });

  it("built mode: origin is the API URL and NODE_ENV production", () => {
    const env = buildAppEnv({ baseEnv, built: true, databaseUrl: "postgres://x", jwtSecret: "s".repeat(64), apiPort: 3001, webPort: 5173 });
    expect(env).toMatchObject({ NODE_ENV: "production", PUBLIC_APP_URL: "http://localhost:3001" });
  });

  it("seed env carries the guard variables", () => {
    const env = buildSeedEnv({ baseEnv, databaseUrl: "postgres://x", host: "172.17.0.5" });
    expect(env).toMatchObject({ CRM_TEST_DATABASE: "1", CRM_PERF_ALLOW_HOST: "172.17.0.5", DATABASE_URL: "postgres://x" });
  });
});

describe("ownership guards", () => {
  it("accepts only the exact name with the label", () => {
    expect(checkContainerOwnership({ name: CONTAINER_NAME, labels: { "hospeda-crm.dev": "1" } })).toEqual({ ok: true });
  });

  it.each([
    ["hospeda-crm-replica-postgres", { "hospeda-crm.dev": "1" }],
    ["crm-perf-seed-pg", {}],
    [CONTAINER_NAME, {}],
    [CONTAINER_NAME, null],
    [CONTAINER_NAME, { "hospeda-crm.dev": "0" }],
  ])("refuses %s with labels %j", (name, labels) => {
    expect(checkContainerOwnership({ name, labels }).ok).toBe(false);
  });

  it("only owns its volume and databases", () => {
    expect(isOwnedVolume({ name: VOLUME_NAME, labels: { "hospeda-crm.dev": "1" } })).toBe(true);
    expect(isOwnedVolume({ name: VOLUME_NAME, labels: null, mountedByOwnedContainer: true })).toBe(true);
    expect(isOwnedVolume({ name: VOLUME_NAME, labels: null })).toBe(false);
    expect(isOwnedVolume({ name: "hospeda-postgres-data", labels: { "hospeda-crm.dev": "1" } })).toBe(false);
    expect(isOwnedDatabase({ dbName: DUMP_TMP_DB })).toBe(true);
    expect(isOwnedDatabase({ dbName: DUMP_DB })).toBe(true);
    expect(isOwnedDatabase({ dbName: "postgres" })).toBe(false);
  });
});

describe("validateDumpPath with symlinks", () => {
  it("rejects a link that resolves into the repo", () => {
    const realpath = (p: string) => (p === "/home/u/links/a.dump" ? "/home/u/repo/secret.dump" : p);
    expect(validateDumpPath({ dumpPath: "/home/u/links/a.dump", repoRoot: "/home/u/repo", realpath }).ok).toBe(false);
  });
});

describe("dump comment", () => {
  it("round-trips source and mtime", () => {
    const comment = formatDumpComment({ source: "/d/it's.dump", mtimeMs: 1700000000123.9 });
    expect(parseDumpComment({ comment })).toEqual({ source: "/d/it's.dump", mtimeMs: 1700000000123 });
  });

  it.each([null, undefined, "", "other", "hospeda-crm.dev dump {bad"])("returns null for %s", (comment) => {
    expect(parseDumpComment({ comment })).toBeNull();
  });
});

describe("planSeeding", () => {
  it("skips everything when the marker is present", () => {
    expect(planSeeding({ marker: SEED_MARKER, accounts: 0, perfRows: 0 })).toEqual({ testSeed: false, perfSeed: false, complete: true });
  });

  it("seeds both on an empty database", () => {
    expect(planSeeding({ marker: null, accounts: 0, perfRows: 0 })).toEqual({ testSeed: true, perfSeed: true, complete: false });
  });

  it("only finishes the perf seed after an interrupted run", () => {
    expect(planSeeding({ marker: null, accounts: 1, perfRows: 0 })).toEqual({ testSeed: false, perfSeed: true, complete: false });
  });

  it("does not reseed a complete database that lacks the marker", () => {
    expect(planSeeding({ marker: null, accounts: 3501, perfRows: 3500 })).toEqual({ testSeed: false, perfSeed: false, complete: false });
  });
});

describe("process identity", () => {
  const stat = (pid: number, comm: string, pgid: number, start: string) =>
    `${pid} (${comm}) S 1 ${pgid} ${pgid} 0 -1 4194560 100 0 0 0 1 1 0 0 20 0 1 0 ${start} 1000 100 18446744073709551615`;

  it("parses fields after the last parenthesis even with odd comm names", () => {
    expect(parseProcStat({ stat: stat(42, "my (weird) app", 40, "98765") })).toEqual({ pgid: 40, startTime: "98765" });
  });

  it("returns null for garbage", () => {
    expect(parseProcStat({ stat: "garbage" })).toBeNull();
  });

  it("matches only when pid, start time and pgid all match", () => {
    const recorded = { pid: 42, startTime: "98765", pgid: 42 };
    expect(isSameProcess({ recorded, readStat: () => stat(42, "npm", 42, "98765") })).toBe(true);
    expect(isSameProcess({ recorded, readStat: () => stat(42, "npm", 42, "11111") })).toBe(false);
    expect(isSameProcess({ recorded, readStat: () => stat(42, "npm", 7, "98765") })).toBe(false);
  });

  it("fails closed on missing record or unreadable stat", () => {
    expect(isSameProcess({ recorded: null, readStat: () => "x" })).toBe(false);
    expect(isSameProcess({ recorded: { pid: 1 }, readStat: () => "x" })).toBe(false);
    expect(isSameProcess({ recorded: { pid: 42, startTime: "1", pgid: 42 }, readStat: () => null })).toBe(false);
    expect(isSameProcess({ recorded: { pid: 42, startTime: "1", pgid: 42 }, readStat: () => { throw new Error("EACCES"); } })).toBe(false);
  });
});

describe("parseSsPids", () => {
  it("extracts every pid from ss output", () => {
    const output = 'LISTEN 0 511 *:3002 *:* users:(("node",pid=123,fd=19),("node",pid=124,fd=20))\n';
    expect(parseSsPids({ output })).toEqual([123, 124]);
  });

  it("returns an empty list when the process is not visible", () => {
    expect(parseSsPids({ output: "LISTEN 0 511 *:3002 *:*\n" })).toEqual([]);
  });
});

describe("docker env", () => {
  it("passes DOCKER_* only to the docker env, never to the app env", () => {
    const parentEnv = { PATH: "/bin", DOCKER_HOST: "unix:///x", DOCKER_CONTEXT: "c", DOCKER_CONFIG: "/cfg" };
    expect(buildDockerEnv({ parentEnv })).toMatchObject({ DOCKER_HOST: "unix:///x", DOCKER_CONTEXT: "c", DOCKER_CONFIG: "/cfg" });
    expect(buildBaseEnv({ parentEnv })).toEqual({ PATH: "/bin" });
  });
});
