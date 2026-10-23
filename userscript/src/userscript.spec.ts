import saved from "../fixtures/saved-name.html?raw";
import number from "../fixtures/unsaved-number.html?raw";
import mixed from "../fixtures/mixed-media.html?raw";
import missing from "../fixtures/missing-metadata.html?raw";
import group from "../fixtures/group.html?raw";
import unknown from "../fixtures/unrecognizable.html?raw";
import { compareSemver, normalizePhone, parseCode } from "./parse";
import { readChat } from "./selectors";
import { batches, filterCached, mergeResults, RegisterController, summarizeResults, messageFingerprint } from "./register";
import { request, ApiError } from "./api";
import { copyDiagnostic } from "./diagnostic";

const gmValues = new Map<string, unknown>();
beforeAll(() => {
  vi.stubGlobal("GM_xmlhttpRequest", () => ({ abort() {} }));
  vi.stubGlobal("GM_getValue", (key: string, fallback: unknown) => gmValues.get(key) ?? fallback);
  vi.stubGlobal("GM_setValue", (key: string, value: unknown) => gmValues.set(key, value));
});
afterAll(() => vi.unstubAllGlobals());

function parse(html: string) { const doc = new DOMParser().parseFromString(html, "text/html"); return readChat(doc); }

describe("userscript parsing", () => {
  it("parses CRM suffix, spacing, lowercase and rejects trailing text", () => {
    expect(parseCode("Cabañas · H1234")).toBe("H1234");
    expect(parseCode("Cabañas ·   h42  ")).toBe("H42");
    expect(parseCode("Cabañas · H42 extra")).toBeNull();
  });
  it("normalizes phones and compares semantic versions", () => {
    expect(normalizePhone("+54 (9) 3442-123456")).toBe("+5493442123456");
    expect(normalizePhone("123")).toBeNull();
    expect(compareSemver("1.0.0", "1.0.1")).toBe(-1);
    expect(compareSemver("1.2.0", "1.1.9")).toBe(1);
    expect(compareSemver("1.0.0", "1.0.0")).toBe(0);
  });
});

describe("WhatsApp fixture readers", () => {
  it("skips rows without a WhatsApp message id instead of sending an empty idempotency key", () => {
    const result = parse('<div id="main"><header><span title="Cabañas del Río · H1234">Cabañas del Río · H1234</span></header><div class="message-in"><span class="selectable-text">Sin id</span></div><div data-id="false_5493442123456@c.us_3EB0AAA111"><span class="selectable-text">Con id</span></div></div>');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.messages.map(message => message.externalId)).toEqual(["false_5493442123456@c.us_3EB0AAA111"]);
  });
  it("reads saved title, CRM code, phone, direction, text, author and local ISO time", () => {
    const result = parse(saved);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.title).toBe("Cabañas del Río · H1234");
    expect(result.code).toBe("H1234");
    expect(result.phone).toBe("+5493442123456");
    expect(result.messages[0]).toMatchObject({ externalId: "false_5493442123456@c.us_3EB0ABC123", direction: "in", text: "Hola", author: "Juan" });
    expect(result.messages[0].sentAt).toMatch(/^2026-10-23T/);
  });
  it("reads an unsaved number chat", () => { const result = parse(number); expect(result.ok && result.phone).toBe("+5493442123456"); });
  it("extracts mixed text and media placeholders in both directions", () => {
    const result = parse(mixed);
    expect(result.ok && result.messages.map(message => [message.direction, message.text])).toEqual([["out", "Hola"], ["in", "[imagen]"], ["in", "[audio 0:12]"]]);
  });
  it("returns null metadata when the pre-plain-text attribute is missing", () => {
    const result = parse(missing); expect(result.ok && result.messages[0]).toMatchObject({ sentAt: null, author: null });
  });
  it("marks group chats unsupported and unknown DOM unreadable", () => {
    expect(parse(group)).toEqual({ ok: false, reason: "unsupported-group" });
    expect(parse(unknown)).toEqual({ ok: false, reason: "unreadable" });
  });
});

describe("registration helpers", () => {
  const messages = Array.from({ length: 120 }, (_, index) => ({ externalId: `id-${index}`, direction: "in" as const, text: "x", sentAt: null, author: null }));
  it("filters cached ids and splits requests into 50/50/20", () => {
    expect(filterCached(messages, ["id-0", "id-2"])).toHaveLength(118);
    expect(batches(messages).map(batch => batch.length)).toEqual([50, 50, 20]);
  });
  it("merges successful and duplicate results without caching rejected ids", () => {
    expect(mergeResults(["old"], [{ externalId: "new", status: "created" }, { externalId: "dup", status: "duplicate" }, { externalId: "bad", status: "rejected" }])).toEqual(["old", "new", "dup"]);
  });
  it("summarizes created, duplicate, and rejected results in Spanish", () => {
    expect(summarizeResults([{ externalId: "a", status: "created" }, { externalId: "b", status: "duplicate" }, { externalId: "c", status: "rejected" }])).toBe("1 registrados · 1 ya estaban · 1 rechazados");
  });
  it("prevents a concurrent second submit", async () => {
    const controller = new RegisterController("https://crm.test", "token");
    const fake = vi.spyOn(globalThis, "GM_xmlhttpRequest").mockImplementation(options => { setTimeout(() => options.onload({ status: 200, response: { results: [] }, responseText: "" }), 0); return { abort() {} }; });
    const first = controller.submit("1", { title: "Chat", phone: null }, [messages[0]!]);
    expect(controller.isSubmitting).toBe(true);
    await expect(controller.submit("1", { title: "Chat", phone: null }, [messages[0]!])).rejects.toThrow("Ya hay un registro en curso.");
    await first; expect(fake).toHaveBeenCalledTimes(1); fake.mockRestore();
  });
});

describe("chat refresh and diagnostic fallback", () => {
  it("fingerprints title, first and last message ids, and count", () => {
    expect(messageFingerprint("Chat", [{ externalId: "first" }, { externalId: "last" }])).toBe("Chat:first:last:2");
    expect(messageFingerprint("Chat", [{ externalId: "first" }, { externalId: "new" }])).not.toBe(messageFingerprint("Chat", [{ externalId: "first" }, { externalId: "last" }]));
  });
  it("opens the fallback with the redacted snapshot when clipboard rejects", async () => {
    const fallback = vi.fn(), success = vi.fn(), clipboard = { writeText: vi.fn().mockRejectedValue(new Error("no activation")) };
    await copyDiagnostic("redacted snapshot", clipboard, fallback, success);
    expect(fallback).toHaveBeenCalledWith("redacted snapshot"); expect(success).not.toHaveBeenCalled();
  });
});

describe("userscript API transport", () => {
  afterEach(() => vi.restoreAllMocks());
  it("sends token and version headers", async () => {
    const stub = vi.spyOn(globalThis, "GM_xmlhttpRequest").mockImplementation(options => { expect(options.headers).toMatchObject({ Authorization: "Bearer private-token", "X-Hospeda-Userscript-Version": "1.0.0" }); options.onload({ status: 200, response: { ok: true }, responseText: "" }); return { abort() {} }; });
    await expect(request("https://crm.test", "private-token")).resolves.toEqual({ ok: true }); expect(stub).toHaveBeenCalledTimes(1);
  });
  it.each([[401, "Token inválido"], [403, "permiso"], [503, "no está disponible"]] as const)("maps HTTP %s", async (status, message) => {
    vi.spyOn(globalThis, "GM_xmlhttpRequest").mockImplementation(options => { options.onload({ status, response: {}, responseText: "{}" }); return { abort() {} }; });
    await expect(request("https://crm.test", "token")).rejects.toThrow(message);
  });
  it("maps 426 and carries minVersion, plus timeout", async () => {
    vi.spyOn(globalThis, "GM_xmlhttpRequest").mockImplementation(options => { options.onload({ status: 426, response: { minVersion: "2.0.0" }, responseText: "" }); return { abort() {} }; });
    await expect(request("https://crm.test", "token")).rejects.toMatchObject({ minVersion: "2.0.0" });
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "GM_xmlhttpRequest").mockImplementation(options => { options.ontimeout(); return { abort() {} }; });
    await expect(request("https://crm.test", "token")).rejects.toThrow("tardó demasiado");
  });
});
