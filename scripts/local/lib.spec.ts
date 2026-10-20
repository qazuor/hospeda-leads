// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  CONTAINER_NAME, DUMP_DB, SYNTHETIC_DB, VOLUME_NAME,
  buildAppEnv, buildBaseEnv, buildDatabaseUrl, buildSeedEnv, checkContainerOwnership, detectDumpFormat, generateJwtSecret, isOwnedDatabase, isOwnedVolume,
  isValidJwtSecret, parseArgs, pickFreePort, redactUrl, resolveDataMode, validateDumpPath,
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
    expect(isOwnedVolume({ name: VOLUME_NAME })).toBe(true);
    expect(isOwnedVolume({ name: "hospeda-postgres-data" })).toBe(false);
    expect(isOwnedDatabase({ dbName: DUMP_DB })).toBe(true);
    expect(isOwnedDatabase({ dbName: "postgres" })).toBe(false);
  });
});
