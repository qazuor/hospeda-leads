import type { InstagramContextResponse, InstagramMatch, StatusResponse } from "../api";
import { accountState, bodyKind, chatUsername, contactBlockReason, initialState, launcherState, selectedMatch, type AppState } from "./state";

const status = (instagramAccount: string | null = "hospeda.com.ar"): StatusResponse => ({ minVersion: "1.5.0", latestVersion: "1.6.0", user: { email: "ana@hospeda.test", displayName: "Ana" }, instagramAccount });
const matchOf = (over: Partial<InstagramMatch> = {}): InstagramMatch => ({ accountId: "7", code: "H7", name: "Cabañas del Río", city: "Colón", status: "contacted", statusLabel: "Contactado", assignedUserName: "Ana", doNotContact: false, restrictionActive: false, archived: false, canContact: true, leads: [{ id: "1", name: "Alojamiento", stage: "Contactado" }], url: "https://crm.test/accounts/7", ...over });
const contextOf = (matches: InstagramMatch[], hiddenMatches = 0): InstagramContextResponse => ({ minVersion: "1.5.0", latestVersion: "1.6.0", user: { email: "ana@hospeda.test", displayName: "Ana" }, instagramAccount: "hospeda.com.ar", hiddenMatches, matches, instagram: { username: "cabanas_del_rio", threadId: null } });
const proven = { ok: true as const, threadId: "1", username: "cabanas_del_rio" };
/** A connected, proven chat with the Hospeda account and the given lookup. */
const ready = (over: Partial<AppState> = {}, matches: InstagramMatch[] = [matchOf()], hidden = 0): AppState => ({ ...initialState({ token: true }), status: { kind: "ok", value: status() }, loggedIn: "hospeda.com.ar", threadId: "1", proof: proven, context: { username: "cabanas_del_rio", kind: "ok", value: contextOf(matches, hidden) }, ...over });

describe("Instagram panel state (spec 97 §4.3–4.5)", () => {
  it("checks the Hospeda account: ok, another account, unknown page or CRM, not configured", () => {
    expect(accountState(ready())).toBe("ok");
    expect(accountState(ready({ loggedIn: "personal.cuenta" }))).toBe("mismatch");
    expect(accountState(ready({ loggedIn: null }))).toBe("unknown");
    expect(accountState(ready({ status: { kind: "loading" } }))).toBe("unknown");
    expect(accountState(ready({ status: { kind: "ok", value: status(null) } }))).toBe("unconfigured");
  });

  it("follows the launcher table, first match wins", () => {
    // Arrange: every row of §4.3, in order.
    const rows: [AppState, string, string][] = [
      [ready({ token: false }), "Falta el token", "warn"],
      [ready({ status: { kind: "rejected" } }), "Falta el token", "warn"],
      [ready({ status: { kind: "outdated", required: "1.6.0" } }), "Actualizá el script", "warn"],
      [ready({ loggedIn: "personal.cuenta" }), "Otra cuenta", "warn"],
      [ready({ status: { kind: "error", message: "x" } }), "Revisá la conexión", "error"],
      [ready({ proof: { ok: false, reason: "several", names: [] } }), "Hospeda", ""],
      [ready({}, [matchOf({ doNotContact: true })]), "H7 · No contactar", "error"],
      [ready({}, [matchOf({ restrictionActive: true })]), "H7 · No contactar", "error"],
      [ready(), "H7", "ok"],
      [ready({}, []), "Sin CRM", ""],
    ];
    // Act / Assert
    for (const [state, label, tone] of rows) expect(launcherState(state), label).toEqual({ label, tone });
  });

  it("picks the main view for every case of US3 and US5", () => {
    expect(bodyKind(ready({ token: false }))).toBe("no-token");
    expect(bodyKind(ready({ status: { kind: "ok", value: status(null) } }))).toBe("unconfigured");
    expect(bodyKind(ready({ loggedIn: "personal.cuenta" }))).toBe("mismatch");
    expect(bodyKind(ready({ loggedIn: null }))).toBe("account-unknown");
    expect(bodyKind(ready({ proof: { ok: false, reason: "no-header", names: [] } }))).toBe("unproven");
    expect(bodyKind(ready({ proof: { ok: false, reason: "no-header", names: [] }, confirm: { username: "cabanas_del_rio", threadId: "1" } }))).toBe("confirm");
    expect(bodyKind(ready({ context: { username: "cabanas_del_rio", kind: "loading" } }))).toBe("searching");
    expect(bodyKind(ready({}, []))).toBe("none");
    expect(bodyKind(ready({}, [], 1))).toBe("hidden");
    expect(bodyKind(ready({}, [matchOf(), matchOf({ accountId: "8", code: "H8" })]))).toBe("multiple");
    expect(bodyKind(ready({ selectedId: "8" }, [matchOf(), matchOf({ accountId: "8", code: "H8" })]))).toBe("business");
  });

  it("knows the chat's username from the header proof or the seller's confirmation of this very thread", () => {
    expect(chatUsername(ready())).toBe("cabanas_del_rio");
    expect(chatUsername(ready({ proof: { ok: false, reason: "no-header", names: [] }, sellerConfirmed: { username: "x.y", threadId: "1", by: "Ana" } }))).toBe("x.y");
    expect(chatUsername(ready({ proof: { ok: false, reason: "no-header", names: [] }, sellerConfirmed: { username: "x.y", threadId: "2", by: "Ana" } }))).toBeNull();
    expect(selectedMatch(ready({}, [matchOf(), matchOf({ accountId: "8" })]))).toBeNull();
  });

  it("explains why «Mandar un mensaje» is disabled", () => {
    expect(contactBlockReason(matchOf())).toBe("");
    expect(contactBlockReason(matchOf({ doNotContact: true }))).toBe("El negocio tiene No contactar activo.");
    expect(contactBlockReason(matchOf({ restrictionActive: true }))).toBe("Hay una restricción activa para Instagram.");
    expect(contactBlockReason(matchOf({ canContact: false }))).toBe("No podés contactar este negocio desde tu usuario.");
  });
});
