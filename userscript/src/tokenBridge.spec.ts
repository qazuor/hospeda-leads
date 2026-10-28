import { afterEach, describe, expect, it, vi } from "vitest";
import { TOKEN_ACK_ATTRIBUTE, TOKEN_ACK_EVENT, TOKEN_EVENT } from "./announce";
import { listenForToken } from "./tokenBridge";

const token = "hcu_" + "a".repeat(43), nonce = "0123456789abcdef0123456789abcdef";
const send = (detail: unknown) => document.dispatchEvent(new CustomEvent(TOKEN_EVENT, { detail }));

describe("listenForToken", () => {
  let stop = () => {};
  afterEach(() => { stop(); document.documentElement.removeAttribute(TOKEN_ACK_ATTRIBUTE); });

  it("saves a token the CRM page hands over once the CRM accepts it, acks its nonce and checks the connection again", async () => {
    // Arrange
    const save = vi.fn(), recheck = vi.fn(), ack = vi.fn(), verify = vi.fn(async () => true);
    document.addEventListener(TOKEN_ACK_EVENT, ack);
    stop = listenForToken({ doc: document, verify, save, recheck });
    // Act
    send(JSON.stringify({ token, nonce }));
    await vi.waitFor(() => expect(ack).toHaveBeenCalled());
    // Assert
    expect(verify).toHaveBeenCalledWith(token);
    expect(save).toHaveBeenCalledWith(token);
    expect(document.documentElement.getAttribute(TOKEN_ACK_ATTRIBUTE)).toBe(nonce);
    expect(ack).toHaveBeenCalledTimes(1);
    expect(recheck).toHaveBeenCalledTimes(1);
    document.removeEventListener(TOKEN_ACK_EVENT, ack);
  });

  it.each([
    ["an object detail", { token, nonce }],
    ["broken JSON", "{"],
    ["something that is not a CRM token", JSON.stringify({ token: "hola", nonce })],
    ["a bad nonce", JSON.stringify({ token, nonce: "x" })],
    ["an oversized detail", JSON.stringify({ token, nonce, pad: "x".repeat(2_000) })],
  ])("ignores %s", (_name, detail) => {
    const save = vi.fn(), recheck = vi.fn(), verify = vi.fn(async () => true);
    stop = listenForToken({ doc: document, verify, save, recheck });
    send(detail);
    expect(save).not.toHaveBeenCalled();
    expect(recheck).not.toHaveBeenCalled();
    expect(document.documentElement.hasAttribute(TOKEN_ACK_ATTRIBUTE)).toBe(false);
  });

  it.each([
    ["the CRM rejects it", async () => false],
    ["the check fails", async () => { throw new Error("offline"); }],
  ])("keeps the saved token and acks a rejection when %s", async (_name, verify) => {
    const save = vi.fn(), recheck = vi.fn(), ack = vi.fn();
    document.addEventListener(TOKEN_ACK_EVENT, ack);
    stop = listenForToken({ doc: document, verify, save, recheck });
    send(JSON.stringify({ token, nonce }));
    await vi.waitFor(() => expect(ack).toHaveBeenCalled());
    expect(save).not.toHaveBeenCalled();
    expect(recheck).not.toHaveBeenCalled();
    expect(document.documentElement.getAttribute(TOKEN_ACK_ATTRIBUTE)).toBe(`${nonce}:rejected`);
    document.removeEventListener(TOKEN_ACK_EVENT, ack);
  });
});
