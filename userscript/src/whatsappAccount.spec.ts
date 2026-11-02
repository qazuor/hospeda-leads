import { loggedInWhatsappPhone, whatsappAccountState } from "./whatsappAccount";

describe("WhatsApp account guard", () => {
  it.each(["5493442123456", "+5493442123456", "543442123456", "+543442123456", "3442123456", "+3442123456"])("accepts Hospeda number variant %s", loggedIn => {
    expect(whatsappAccountState({ expected: "5493442123456", loggedIn })).toBe("ok");
  });
  it.each(["5493442999999", "5493442123457"])("rejects a similar but different number %s", loggedIn => {
    expect(whatsappAccountState({ expected: "5493442123456", loggedIn })).toBe("mismatch");
  });
  it("distinguishes unconfigured, unknown, matching and other accounts", () => {
    expect(whatsappAccountState({ expected: null, loggedIn: null })).toBe("unconfigured");
    expect(whatsappAccountState({ expected: "5493442123456", loggedIn: null })).toBe("unknown");
    expect(whatsappAccountState({ expected: "5493442123456", loggedIn: "3442123456" })).toBe("ok");
    expect(whatsappAccountState({ expected: "5493442123456", loggedIn: "5491112345678" })).toBe("mismatch");
  });
  it.each([['"5493442123456:12@c.us"', "5493442123456"], ["5493442123456:12@c.us", "5493442123456"], [null, null], ["garbage", null], ["42", null]])("reads last-wid-md %s", (stored, expected) => {
    expect(loggedInWhatsappPhone({ getItem: () => stored } as unknown as Storage)).toBe(expected);
  });
  it("treats inaccessible localStorage as unknown", () => {
    expect(loggedInWhatsappPhone({ getItem: () => { throw new Error("denied"); } } as unknown as Storage)).toBeNull();
  });
});
