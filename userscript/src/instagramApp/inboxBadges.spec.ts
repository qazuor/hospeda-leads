import inboxList from "../../fixtures/instagram-inbox-list-es.html?raw";
import threadEs from "../../fixtures/instagram-thread-header-es.html?raw";
import type { InstagramInboxBadge, InstagramInboxThread } from "../api";
import { INBOX_BADGE_ATTRIBUTE, conversationList, inboxChatRows, normalizeDisplayName, uniqueByName } from "../instagram/inbox";
import { conversationPane } from "../instagram/finders";
import { headerDisplayName, headerText, proveThread } from "../instagram/thread";
import { applyInboxBadges, inboxBadgeDetail, inboxBadgeText, removeInboxBadges } from "./inboxBadges";

const single = (code: string, over: Partial<Extract<InstagramInboxBadge, { kind: "single" }>> = {}): InstagramInboxBadge => ({ kind: "single", accountId: code.slice(1), code, name: `Negocio ${code}`, city: "Colón", statusLabel: "Contactado", assignedUserName: "Ana", doNotContact: false, restricted: false, openManagement: { stageLabel: "Contactado", typeLabel: "Principal" }, ...over });
const thread = (displayName: string, username: string, badge: InstagramInboxBadge = single("H7")): InstagramInboxThread => ({ displayName, username, badge });
const mount = () => { history.replaceState(null, "", "/direct/inbox/"); document.body.innerHTML = inboxList; };
const badgeOf = (id: string) => document.getElementById(id)!.querySelector<HTMLElement>(`[${INBOX_BADGE_ATTRIBUTE}]`);
const pillText = (id: string) => badgeOf(id)?.shadowRoot?.querySelector(".pill")?.textContent ?? null;
const apply = (threads: InstagramInboxThread[], dark = false) => applyInboxBadges({ doc: document, threads, dark, ownUsername: "hospeda.com.ar", base: "https://crm.test" });
const cardOf = () => document.querySelector<HTMLElement>("[data-hospeda-inbox-card]")?.shadowRoot?.querySelector<HTMLElement>(".card") ?? null;
const hover = (id: string) => badgeOf(id)!.dispatchEvent(new MouseEvent("mouseenter"));
afterEach(() => { removeInboxBadges({ doc: document }); document.body.innerHTML = ""; history.replaceState(null, "", "/"); });

describe("Instagram conversation list rows (spec 97 §15, live findings §9.1 item 9)", () => {
  it("finds the list and only the chat rows: switcher, labelled buttons, notes tray and tablist are skipped", () => {
    // Arrange
    mount();
    // Act
    const rows = inboxChatRows({ doc: document, ownUsername: "hospeda.com.ar" });
    // Assert
    expect(conversationList({ doc: document })?.getAttribute("aria-label")).toBe("Lista de conversaciones");
    expect(rows.map(row => row.row.id)).toEqual(["row-leandro", "row-joaquin", "row-preview", "row-ana", "row-pena"]);
    expect(rows.map(row => row.name)).toEqual(["Leandro Asrilevich", "Joaquín Asrilevich", "Cabañas del Río", "Ana Gómez", "Peña Alojamientos"]);
  });
  it("reads the English label too and finds nothing without a list", () => {
    document.body.innerHTML = inboxList.replace("Lista de conversaciones", "Conversation list"); expect(inboxChatRows({ doc: document, ownUsername: "hospeda.com.ar" })).toHaveLength(5);
    document.body.innerHTML = "<div role=\"main\"></div>"; expect(inboxChatRows({ doc: document })).toEqual([]);
  });
  it("matches exactly: ignores case and spacing only; accents count, ñ ≠ n, invisible format characters are dropped", () => {
    expect(normalizeDisplayName("  Joaquín   ASRILEVICH ")).toBe("joaquín asrilevich");
    expect(normalizeDisplayName("José")).not.toBe(normalizeDisplayName("Jose"));
    expect(normalizeDisplayName("Peña")).not.toBe(normalizeDisplayName("Pena"));
    expect(normalizeDisplayName("Ana\u200bGómez")).toBe(normalizeDisplayName("AnaGómez"));
  });
  it("ignores a malformed list instead of throwing (review H1)", () => {
    expect(uniqueByName({} as unknown as InstagramInboxThread[]).size).toBe(0);
    expect(uniqueByName([null, { displayName: 5 }] as unknown as InstagramInboxThread[]).size).toBe(0);
  });
  it("maps a name shared by two learned threads to none", () => {
    const map = uniqueByName([thread("Ana Gómez", "ana.uno"), thread("ana  GÓMEZ", "ana.dos"), thread("Leandro Asrilevich", "qaz.uor")]);
    expect(map.get("ana gómez")).toBeNull(); expect(map.get("leandro asrilevich")?.username).toBe("qaz.uor");
  });
});

describe("Instagram conversation list badges (spec 97 §15)", () => {
  it("marks a row whose name matches exactly one learned thread, right after the name", () => {
    mount();
    expect(apply([thread("Leandro Asrilevich", "qaz.uor", single("H7")), thread("joaquín  asrilevich", "joaco.a", single("H8"))])).toBe(2);
    expect(pillText("row-leandro")).toBe("HH7"); expect(pillText("row-joaquin")).toBe("HH8");
    expect(badgeOf("row-leandro")!.previousElementSibling!.textContent).toBe("Leandro Asrilevich");
  });
  it("never matches the preview: a learned name in another row's last message marks nothing there", () => {
    mount(); apply([thread("Leandro Asrilevich", "qaz.uor")]);
    expect(badgeOf("row-preview")).toBeNull(); expect(badgeOf("row-leandro")).not.toBeNull();
  });
  it("marks none when two learned threads share the name, and none for an unknown name or ñ ≠ n", () => {
    mount(); apply([thread("Ana Gómez", "ana.uno"), thread("ANA GÓMEZ", "ana.dos"), thread("Pena Alojamientos", "pena")]);
    expect(badgeOf("row-ana")).toBeNull(); expect(badgeOf("row-pena")).toBeNull(); expect(document.querySelectorAll(`[${INBOX_BADGE_ATTRIBUTE}]`)).toHaveLength(0);
  });
  it("needs the exact accents: a learned «Joaquin» (no accent) does not mark «Joaquín»", () => {
    mount(); apply([thread("Joaquin Asrilevich", "joaco.a")]); expect(badgeOf("row-joaquin")).toBeNull();
  });
  it("marks none when two visible rows show the same name, even with one learned thread (review M1)", () => {
    mount(); document.querySelector("#row-ana span span")!.textContent = "Leandro Asrilevich";
    expect(apply([thread("Leandro Asrilevich", "qaz.uor")])).toBe(0); expect(badgeOf("row-leandro")).toBeNull(); expect(badgeOf("row-ana")).toBeNull();
  });
  it("never marks the account switcher or the notes tray, even with a learned thread of that name", () => {
    mount(); apply([thread("hospeda.com.ar", "hospeda.com.ar"), thread("Compartí una nota", "nota")]);
    expect(badgeOf("switcher")).toBeNull(); expect(badgeOf("notes")).toBeNull();
  });
  it("shows «No contactar» in red and how many businesses share an Instagram, with the details as the accessible label (no native tooltip)", () => {
    mount();
    apply([thread("Leandro Asrilevich", "qaz.uor", single("H7", { doNotContact: true })), thread("Ana Gómez", "ana", { kind: "multiple", businesses: [{ accountId: "1", code: "H1", name: "Uno", statusLabel: null }, { accountId: "2", code: "H2", name: "Dos", statusLabel: "Cliente" }] })]);
    const pill = badgeOf("row-leandro")!.shadowRoot!.querySelector<HTMLElement>(".pill")!;
    expect(pill.className).toContain("red"); expect(pill.textContent).toBe("HH7 · No contactar"); expect(pill.title).toBe(""); expect(pill.getAttribute("aria-label")).toContain("No contactar");
    expect(pillText("row-ana")).toBe("H2 negocios");
    expect(inboxBadgeDetail(single("H7"))).toBe("H7 · Colón\nNegocio H7\nContactado · Ana\nContactado · Principal");
    expect(inboxBadgeText(single("H9", { restricted: true }))).toBe("H9 · No contactar");
  });
  it("shows the shared hover card with «Abrir en el CRM» linking to the account, in a fixed layer outside the list", () => {
    // Arrange
    mount(); apply([thread("Leandro Asrilevich", "qaz.uor", single("H7"))]);
    // Act
    hover("row-leandro");
    // Assert
    const card = cardOf()!, link = card.querySelector<HTMLAnchorElement>("a.btn")!;
    expect(link.textContent).toBe("Abrir en el CRM"); expect(link.href).toBe("https://crm.test/accounts/7"); expect(link.target).toBe("_blank"); expect(link.rel).toBe("noopener noreferrer");
    expect(card.querySelector(".name")!.textContent).toBe("Negocio H7"); expect(card.style.top).not.toBe("");
    expect(conversationList({ doc: document })!.contains(document.querySelector("[data-hospeda-inbox-card]"))).toBe(false);
  });
  it("links every business of a «multiple» card", () => {
    mount(); apply([thread("Ana Gómez", "ana", { kind: "multiple", businesses: [{ accountId: "1", code: "H1", name: "Uno", statusLabel: null }, { accountId: "2", code: "H2", name: "Dos", statusLabel: "Cliente" }] })]);
    hover("row-ana");
    expect([...cardOf()!.querySelectorAll<HTMLAnchorElement>("a.item")].map(a => a.href)).toEqual(["https://crm.test/accounts/1", "https://crm.test/accounts/2"]);
  });
  it("clicks and presses on the pill or the card link never reach Instagram's row or document", () => {
    // Arrange
    mount(); apply([thread("Leandro Asrilevich", "qaz.uor")]);
    const events: string[] = [], row = document.getElementById("row-leandro")!;
    row.addEventListener("click", () => events.push("row")); row.addEventListener("mousedown", () => events.push("row-down")); document.addEventListener("click", () => events.push("doc"));
    // Act
    const pill = badgeOf("row-leandro")!.shadowRoot!.querySelector<HTMLElement>(".pill")!; pill.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, composed: true })); pill.click();
    hover("row-leandro"); const link = cardOf()!.querySelector<HTMLAnchorElement>("a.btn")!; link.addEventListener("click", event => event.preventDefault()); link.click();
    // Assert
    expect(events).toEqual([]);
  });
  it("hides the card after leaving the pill, but keeps it while the mouse is on the card", () => {
    vi.useFakeTimers();
    try {
      mount(); apply([thread("Leandro Asrilevich", "qaz.uor")]); hover("row-leandro");
      const layer = document.querySelector<HTMLElement>("[data-hospeda-inbox-card]")!;
      badgeOf("row-leandro")!.dispatchEvent(new MouseEvent("mouseleave")); layer.dispatchEvent(new MouseEvent("mouseenter")); vi.advanceTimersByTime(500); expect(cardOf()).not.toBeNull();
      layer.dispatchEvent(new MouseEvent("mouseleave")); vi.advanceTimersByTime(500); expect(cardOf()).toBeNull();
    } finally { vi.useRealTimers(); }
  });
  it("survives re-renders: keeps a current badge, re-adds a lost one, moves it when a row is recycled for another chat", () => {
    mount(); apply([thread("Leandro Asrilevich", "qaz.uor")]); const first = badgeOf("row-leandro");
    apply([thread("Leandro Asrilevich", "qaz.uor")]); expect(badgeOf("row-leandro")).toBe(first);// unchanged: same node
    // React re-rendered the row: our host is gone.
    first!.remove(); apply([thread("Leandro Asrilevich", "qaz.uor")]); expect(badgeOf("row-leandro")).not.toBeNull();
    // The virtualized list reused the row for another chat: the stale badge goes away.
    document.querySelector("#row-leandro span span")!.textContent = "Otra Persona"; apply([thread("Leandro Asrilevich", "qaz.uor")]); expect(badgeOf("row-leandro")).toBeNull();
  });
  it("skips the row work when nothing changed between polls (review L4)", () => {
    mount(); const threads = [thread("Leandro Asrilevich", "qaz.uor")]; apply(threads);
    const query = vi.spyOn(document.getElementById("row-leandro")!, "querySelector"); apply(threads); expect(query).not.toHaveBeenCalled();
    document.querySelector("#row-ana span span")!.textContent = "Ana Gómez Nueva"; apply(threads); expect(query).toHaveBeenCalled();
  });
  it("builds the badge without innerHTML or insertAdjacentHTML", () => {
    mount();
    const element = vi.spyOn(Element.prototype, "innerHTML", "set"), shadow = vi.spyOn(ShadowRoot.prototype, "innerHTML", "set"), adjacent = vi.spyOn(Element.prototype, "insertAdjacentHTML");
    try { apply([thread("Leandro Asrilevich", "qaz.uor", single("H7", { name: "<img src=x onerror=alert(1)>" }))]); hover("row-leandro"); expect(element).not.toHaveBeenCalled(); expect(shadow).not.toHaveBeenCalled(); expect(adjacent).not.toHaveBeenCalled(); }
    finally { element.mockRestore(); shadow.mockRestore(); adjacent.mockRestore(); }
    expect(badgeOf("row-leandro")!.shadowRoot!.querySelector("img")).toBeNull(); expect(cardOf()!.querySelector("img")).toBeNull(); expect(cardOf()!.querySelector(".name")!.textContent).toBe("<img src=x onerror=alert(1)>");
  });
  it("follows the theme and is removed on demand", () => {
    mount(); apply([thread("Leandro Asrilevich", "qaz.uor")], true);
    expect(badgeOf("row-leandro")!.className).toBe("dark");
    removeInboxBadges({ doc: document }); expect(document.querySelectorAll(`[${INBOX_BADGE_ATTRIBUTE}]`)).toHaveLength(0);
  });
});

describe("chat page header and the list beside it (spec 97 §9.1 item 9)", () => {
  const withList = (chat: string) => chat.replace('<div role="main">', `<div role="main"><div aria-label="Lista de conversaciones"><div role="button" tabindex="0"><img alt="user-profile-picture" src=""><span>Otra Persona</span><span>Somos 4 personas</span></div></div>`);
  it("reads the display name from the pane heading, else from the header link without the username", () => {
    history.replaceState(null, "", "/direct/t/17848251833510164/");
    document.body.innerHTML = threadEs; expect(headerDisplayName({ doc: document, username: "qaz.uor" })).toBe("Qaz Uor");
    document.body.innerHTML = threadEs.replace('<div role="grid"', '<h2>Joaquín  Asrilevich</h2><div role="grid"'); expect(headerDisplayName({ doc: document, username: "qaz.uor" })).toBe("Joaquín Asrilevich");
    document.body.innerHTML = threadEs.replace("<span>Qaz Uor</span><span>qaz.uor</span>", "Leandro Asrilevichqaz.uor"); expect(headerDisplayName({ doc: document, username: "qaz.uor" })).toBe("Leandro Asrilevich");
    document.body.innerHTML = threadEs.replace('<div role="grid"', '<h1>Uno</h1><h2>Dos</h2><div role="grid"'); expect(headerDisplayName({ doc: document, username: "qaz.uor" })).toBeNull();
  });
  it("never trusts a heading without the labelled header link of that same user (review H2)", () => {
    history.replaceState(null, "", "/direct/t/17848251833510164/");
    document.body.innerHTML = threadEs.replace('<div role="grid"', '<h2>Otra Persona</h2><div role="grid"');
    expect(headerDisplayName({ doc: document, username: "otra.persona" })).toBeNull();
    const pane = document.querySelector('[role="main"]')!; for (const link of pane.querySelectorAll("a[aria-label]")) link.removeAttribute("aria-label");
    expect(headerDisplayName({ doc: document, username: "qaz.uor" })).toBeNull();
  });
  it("keeps proving the chat when the conversation list sits inside the same pane, and never reads its previews as header", () => {
    history.replaceState(null, "", "/direct/t/17848251833510164/"); document.body.innerHTML = withList(threadEs);
    expect(proveThread({ doc: document, readPath: () => location.pathname })).toEqual({ ok: true, threadId: "17848251833510164", username: "qaz.uor" });
    expect(headerText(conversationPane({ doc: document })!)).not.toContain("personas");
    expect(headerDisplayName({ doc: document, username: "qaz.uor" })).toBe("Qaz Uor");
  });
  it("a labelled profile link of another user inside a list row does not break the proof (review L8)", () => {
    history.replaceState(null, "", "/direct/t/17848251833510164/");
    document.body.innerHTML = withList(threadEs).replace("<span>Otra Persona</span>", '<a href="/otra.persona/" aria-label="Abrir la página del perfil de otra.persona"><span>Otra Persona</span></a>');
    expect(proveThread({ doc: document, readPath: () => location.pathname })).toEqual({ ok: true, threadId: "17848251833510164", username: "qaz.uor" });
  });
});
