import { loginUrlWithNext, safeNextPath } from "./safeNextPath";

describe("safeNextPath", () => {
  it("keeps internal paths with query and hash", () => {
    expect(safeNextPath("/accounts/2162?tab=comunicacion#top")).toBe("/accounts/2162?tab=comunicacion#top");
  });
  it.each(["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "/login", "/login?next=/x", "/register", "/forgot-password", "/reset-password?token=a", "", "/a\nb", "/a\\b", "/a\u0000b"])("rejects %j", value => {
    expect(safeNextPath(value)).toBeNull();
  });
  it("rejects null, undefined and overlong values", () => {
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
    expect(safeNextPath("/" + "a".repeat(2000))).toBeNull();
  });
  it("accepts paths that merely start like an auth route", () => {
    expect(safeNextPath("/login-history")).toBe("/login-history");
  });
});

describe("loginUrlWithNext", () => {
  it("encodes pathname, search and hash", () => {
    expect(loginUrlWithNext({ pathname: "/accounts/2162", search: "?tab=comunicacion", hash: "#x" })).toBe("/login?next=" + encodeURIComponent("/accounts/2162?tab=comunicacion#x"));
  });
  it("returns plain /login for the root", () => {
    expect(loginUrlWithNext({ pathname: "/" })).toBe("/login");
  });
});
