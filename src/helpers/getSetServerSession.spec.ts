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
    await expect(load()).rejects.toThrow(/JWT_SECRET must be set and at least 32/);
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
