// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const load = () => import("./getSetServerSession");
const session = { id: "s1", createdAt: 1, lastAccessed: 1 };
const cookieOf = (response: Response) => response.headers.get("Set-Cookie")!.split(";")[0];

describe("JWT_SECRET boot validation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("throws a clear error when JWT_SECRET is missing", async () => {
    vi.resetModules();
    vi.stubEnv("JWT_SECRET", "");
    await expect(load()).rejects.toThrow(/JWT_SECRET must be set to a real random secret of at least 32/);
  });

  it.each([
    "development-only-change-me",
    "development-only-change-me-not-for-production",
    "change-me-with-at-least-32-random-bytes",
    "my-super-long-ChangeMe-secret-value-123456",
    "an-example-secret-that-is-long-enough-0000",
    "generate-a-random-secret-not-for-production",
  ])("rejects the placeholder %s", async (placeholder) => {
    vi.resetModules();
    vi.stubEnv("JWT_SECRET", placeholder);
    await expect(load()).rejects.toThrow(/JWT_SECRET must be set to a real random secret/);
  });

  it("accepts the CI secret", async () => {
    vi.resetModules();
    vi.stubEnv("JWT_SECRET", "ci-test-secret-that-is-long-enough-for-hs256");
    await expect(load()).resolves.toBeDefined();
  });

  it("throws when JWT_SECRET is shorter than 32 characters", async () => {
    vi.resetModules();
    vi.stubEnv("JWT_SECRET", "x".repeat(31));
    await expect(load()).rejects.toThrow(/got 31/);
  });

  it("loads with a valid secret and round-trips a session", async () => {
    vi.resetModules();
    vi.stubEnv("JWT_SECRET", "y".repeat(32));
    const mod = await load();
    const response = new Response();
    await mod.setServerSession(response, session);
    const restored = await mod.getServerSessionOrThrow(new Request("http://x", { headers: { cookie: cookieOf(response) } }));
    expect(restored.id).toBe("s1");
  });

  it("does not verify tokens signed with a different secret", async () => {
    vi.resetModules();
    vi.stubEnv("JWT_SECRET", "a".repeat(32));
    const response = new Response();
    await (await load()).setServerSession(response, session);
    vi.resetModules();
    vi.stubEnv("JWT_SECRET", "b".repeat(32));
    const other = await load();
    await expect(other.getServerSessionOrThrow(new Request("http://x", { headers: { cookie: cookieOf(response) } }))).rejects.toThrow();
  });
});

describe("JWT_SECRET marker list and whitespace warning", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the placeholder markers identical to scripts/local/lib.mjs", async () => {
    // @ts-expect-error plain ESM script without types
    const lib = await import("../../scripts/local/lib.mjs");
    const { PlaceholderMarkers } = await load();
    expect([...lib.JwtPlaceholderMarkers]).toEqual([...PlaceholderMarkers]);
  });

  it.each([" ", '"', "'"])("warns but still accepts a secret with a surrounding %j", async (wrap) => {
    const { requireJwtSecret } = await load();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const value = `${wrap}a8f3k2j9d0s7h1g5l4p6q8w2e3r4t5y6${wrap}`;
    expect(requireJwtSecret(value)).toBe(value);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/surrounding whitespace or quotes/));
  });

  it("does not warn for a clean secret", async () => {
    const { requireJwtSecret } = await load();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    requireJwtSecret("a8f3k2j9d0s7h1g5l4p6q8w2e3r4t5y6");
    expect(warn).not.toHaveBeenCalled();
  });
});
