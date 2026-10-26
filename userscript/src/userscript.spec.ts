import saved from "../fixtures/saved-name.html?raw";
import number from "../fixtures/unsaved-number.html?raw";
import mixed from "../fixtures/mixed-media.html?raw";
import missing from "../fixtures/missing-metadata.html?raw";
import group from "../fixtures/group.html?raw";
import unknown from "../fixtures/unrecognizable.html?raw";
import currentSaved from "../fixtures/current-saved-name.html?raw";
import currentNumber from "../fixtures/current-unsaved-number.html?raw";
import currentGroup from "../fixtures/current-group.html?raw";
import { fromChatModel, internalChat } from "./internals";
import { compareSemver, normalizePhone, parseCode } from "./parse";
import { parsePrePlainText, readChat, redactedSnapshot } from "./selectors";
import { NO_CHAT, NO_MATCH, isDark, pendingUpdate, waitForRail, openWhatsappNotice, renderBanner, resetPanelState } from "./ui";
import { PANEL_CSS } from "./styles";
import { announceInstalled, INSTALLED_ATTRIBUTE, INSTALLED_EVENT } from "./announce";
import { resetUpdatePrompt, showUpdatePrompt, throttled, UPDATE_PROMPT_ID } from "./updatePrompt";
import { batches, filterCached, mergeResults, RegisterController, summarizeResults, messageFingerprint } from "./register";
import { request, ApiError } from "./api";
import { USERSCRIPT_VERSION } from "./version";
import { copyDiagnostic } from "./diagnostic";
import {chatMatchesRecipient,getWhatsAppComposer,pasteIntoComposer} from './selectors';
import {initialComposeChoice,canPasteTemplate} from './compose';

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

describe('CRM template compose helpers',()=>{
 it('starts with the recommended model and default person',()=>{expect(initialComposeChoice([{id:'l1',name:'Gestión',type:null,stage:'Nueva',templates:[{id:'t1',name:'General',recommended:false,body:"Hola"},{id:'t2',name:'Etapa',recommended:true,body:"Hola"}],contacts:[{id:'c1',name:'Ana',phone:'+5491111111111',default:true}]}])).toEqual({leadId:'l1',templateId:'t2',contactId:'c1'});});
 it('blocks pasting when CRM says blocked or variables remain unresolved',()=>{const prepared={messageId:'id',revision:1,body:'Hola {{nombre}}',recipient:'54911111111',recipientName:'Ana',unresolved:[]};expect(canPasteTemplate(prepared,'No contactar')).toBe(false);expect(canPasteTemplate({...prepared,unresolved:['nombre']},null)).toBe(false);expect(canPasteTemplate(prepared,null)).toBe(true);});
 it('blocks known phone mismatches and permits an unknown chat phone',()=>{expect(chatMatchesRecipient('+54 9 11 1234-5678','5491112345678')).toBe(true);expect(chatMatchesRecipient('+54 9 3442 45-3797','3442 453797')).toBe(true);expect(chatMatchesRecipient('+54 9 3442 45-3797','03442 15 453797')).toBe(true);expect(chatMatchesRecipient('+54 9 11 1234-5678','5491112345679')).toBe(false);expect(chatMatchesRecipient(null,'5491112345678')).toBe(true);});
 it('writes only into an empty footer composer and never invokes WhatsApp send controls',()=>{document.body.innerHTML='<div id="main"><footer><div contenteditable="true"></div><button data-testid="send">Enviar</button></footer></div>';const editor=getWhatsAppComposer()!;const exec=vi.fn((_command:string,_show?:boolean,value?:string)=>{editor.textContent=value||'';return true;});Object.defineProperty(document,'execCommand',{configurable:true,value:exec});const send=document.querySelector('button')!,clicked=vi.fn();send.addEventListener('click',clicked);const pressed: string[]=[];editor.addEventListener('keydown',event=>pressed.push(event.key));expect(pasteIntoComposer(editor,'Texto de prueba')).toBe(true);expect(editor.textContent).toBe('Texto de prueba');expect(pasteIntoComposer(editor,'No pisar')).toBe(false);expect(exec).toHaveBeenCalledTimes(1);expect(clicked).not.toHaveBeenCalled();expect(pressed).toEqual([]);});
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

describe("current WhatsApp Web DOM (captured 25/10/2026)", () => {
  it("reads the chat name instead of the avatar button title and the inner time/author attribute", () => {
    const result = parse(currentSaved);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.title).toBe("Cabañas del Río · H1234");
    expect(result.code).toBe("H1234");
    expect(result.phone).toBeNull();
    expect(result.messages[0]).toMatchObject({ externalId: "3EB0A1B2C3D4E5F60001", direction: "out", text: "Hola, te escribo de Hospeda", author: "Negocio" });
    expect(result.messages[0].sentAt).toBe(new Date(2026, 9, 25, 15, 12).toISOString());
    expect(result.messages.at(-1)).toMatchObject({ direction: "in", text: "Sí, contame", author: "Juan Pérez" });
  });
  it("skips a bubble without tail when the layout cannot tell its side, and uses the side when it can", () => {
    const doc = new DOMParser().parseFromString(currentSaved, "text/html");
    expect((() => { const result = readChat(doc); return result.ok ? result.messages.map(message => message.externalId) : []; })()).toEqual(["3EB0A1B2C3D4E5F60001", "3EB0A1B2C3D4E5F60003"]);
    const rect = (left: number, right: number) => ({ left, right, width: right - left, top: 0, bottom: 10, height: 10, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;
    doc.querySelector<HTMLElement>("#main")!.getBoundingClientRect = () => rect(0, 1000);
    for (const bubble of doc.querySelectorAll<HTMLElement>("[data-testid='msg-container']")) bubble.getBoundingClientRect = () => rect(700, 980);
    const result = readChat(doc);
    expect(result.ok && result.messages.map(message => [message.externalId, message.direction])).toEqual([["3EB0A1B2C3D4E5F60001", "out"], ["3EB0A1B2C3D4E5F60002", "out"], ["3EB0A1B2C3D4E5F60003", "in"]]);
  });
  it("keeps only the message text, not the bubble time", () => {
    const result = parse(currentNumber);
    expect(result.ok && result.messages.map(message => message.text)).toEqual(["Buenas"]);
    expect(result.ok && result.phone).toBe("+5493442123456");
  });
  it("treats received messages from several senders as a group", () => { expect(parse(currentGroup)).toEqual({ ok: false, reason: "unsupported-group" }); });
  it("parses 24-hour, 12-hour and two-digit-year headers as local time and rejects impossible dates", () => {
    expect(parsePrePlainText("[2:05 p. m., 23/10/26] Juan: ")).toEqual({ sentAt: new Date(2026, 9, 23, 14, 5).toISOString(), author: "Juan" });
    expect(parsePrePlainText("[12:30\u202fa.\u00a0m., 1/2/2026] Ana: ").sentAt).toBe(new Date(2026, 1, 1, 0, 30).toISOString());
    expect(parsePrePlainText("[14:05, 31/02/2026] Juan: ")).toEqual({ sentAt: null, author: "Juan" });
    expect(parsePrePlainText(null)).toEqual({ sentAt: null, author: null });
  });
});

describe("internal chat fallback", () => {
  it("reads the real number of a @lid chat and flags groups", () => {
    expect(fromChatModel({ contact: { id: { _serialized: "123456789012345@lid" }, phoneNumber: { _serialized: "5493442453797@c.us", user: "5493442453797" } } })).toEqual({ phone: "+5493442453797", group: false });
    expect(fromChatModel({ id: { _serialized: "5493442123456@c.us" } })).toEqual({ phone: "+5493442123456", group: false });
    expect(fromChatModel({ id: { _serialized: "120363041234567890@g.us" } })).toEqual({ phone: null, group: true });
    expect(fromChatModel({ id: { _serialized: "123456789012345@lid" } })).toEqual({ phone: null, group: false });
  });
  it("walks the header's fiber ancestors and fails closed", () => {
    const header = document.createElement("header");
    Object.assign(header, { "__reactFiber$abc": { memoizedProps: {}, return: { memoizedProps: { chat: { contact: { phoneNumber: { user: "5493442453797" } } } } } } });
    expect(internalChat(header)).toEqual({ phone: "+5493442453797", group: false });
    expect(internalChat(document.createElement("header"))).toBeNull();
    expect(internalChat(null)).toBeNull();
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
    const stub = vi.spyOn(globalThis, "GM_xmlhttpRequest").mockImplementation(options => { expect(options.headers).toMatchObject({ Authorization: "Bearer private-token", "X-Hospeda-Userscript-Version": USERSCRIPT_VERSION }); options.onload({ status: 200, response: { ok: true }, responseText: "" }); return { abort() {} }; });
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

describe("userscript safety", () => {
  it("masks every long digit run in the diagnostic snapshot", () => {
    const doc = new DOMParser().parseFromString('<div id="main"><div data-id="false_5493442123456@c.us_3EB0ABC123"></div><div data-id="true_120363041234567890@g.us_3EB0DEF456_5493442999888@c.us"></div></div>', "text/html");
    const snapshot = redactedSnapshot(doc);
    expect(snapshot).not.toMatch(/\d{4,}/);
    expect(snapshot).toContain("456@");
  });
});

describe("panel", () => {
  const match = { accountId: "1234", code: "H1234", name: "Cabañas del Río", city: "Colón", status: "reviewed", statusLabel: "Revisado", assignedUserName: null, doNotContact: false, restrictionActive: false, archived: false, leads: [], url: "https://crm.example/accounts/1234" };
  const context = (matches = [match]) => ({ minVersion: "1.2.0", user: { email: "a@b.c", displayName: "Ana" }, matches });
  const message = (externalId: string, direction: "in" | "out", text: string) => ({ externalId, direction, text, sentAt: null, author: null });
  const shadow = (host: HTMLElement) => host.shadowRoot!;
  const button = (host: HTMLElement, text: string) => [...shadow(host).querySelectorAll("button")].find(item => item.textContent?.startsWith(text));
  beforeEach(() => { gmValues.clear(); gmValues.set("hospeda-userscript-token", "hcu_test"); resetPanelState(); waitForRail(0); document.getElementById("hospeda-userscript-banner")?.remove(); });

  it("keeps the launcher and panel on the page without an open chat", () => {
    const host = renderBanner({ context: null, selected: null, register: null, onSelect: () => {} });
    expect(host.parentElement).toBe(document.body);
    expect(shadow(host).querySelector<HTMLButtonElement>(".launcher")?.getAttribute("aria-label")).toMatch(/^Hospeda CRM: Hospeda/);
    expect(shadow(host).textContent).toContain(NO_CHAT);
  });
  it("asks for the token in the panel, validates it and saves it", () => {
    gmValues.set("hospeda-userscript-token", "");
    const onSaveToken = vi.fn(), host = renderBanner({ context: null, selected: null, register: null, onSelect: () => {}, onSaveToken });
    expect(shadow(host).querySelector<HTMLButtonElement>(".launcher")?.getAttribute("aria-label")).toContain("Falta el token");
    const input = shadow(host).querySelector<HTMLInputElement>("input[type=password]")!, form = shadow(host).querySelector("form")!;
    input.value = "otra-cosa"; form.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(onSaveToken).not.toHaveBeenCalled(); expect(shadow(host).textContent).toContain("empieza con hcu_");
    input.value = " hcu_abc-123 "; form.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(onSaveToken).toHaveBeenCalledWith("hcu_abc-123");
  });
  it("opens the settings from the gear and disconnects", () => {
    const onClearToken = vi.fn(), host = renderBanner({ context: context(), selected: null, register: null, onSelect: () => {}, onClearToken, version: "1.2.0", crmBase: "https://crm.example" });
    shadow(host).querySelector<HTMLButtonElement>("button[aria-label='Ajustes']")!.click();
    expect(shadow(host).textContent).toContain("Conectado como Ana");
    expect(shadow(host).textContent).toContain("Versión 1.2.0");
    expect(shadow(host).querySelector<HTMLAnchorElement>("a")!.href).toBe("https://crm.example/guide?topic=whatsapp-userscript&article=install-userscript");
    button(host, "Desconectar")!.click(); expect(onClearToken).toHaveBeenCalledTimes(1);
  });
  it("warns that the number belongs to a business the seller cannot see, without offering to link it", () => {
    const host = renderBanner({ context: { ...context([]), hiddenMatches: 1 }, selected: null, register: null, title: "Juan", crmBase: "https://crm.example", onSelect: () => {} });
    expect(shadow(host).textContent).toContain("NEGOCIO NO VISIBLE"); expect(shadow(host).textContent).toContain("Consultá a un administrador antes de escribirle.");
    expect(shadow(host).textContent).not.toContain("SIN ASOCIAR"); expect(shadow(host).querySelector(".body a")).toBeNull();
  });
  it("explains how to link a chat the CRM could not match, even when there was nothing to look up", () => {
    for (const lookup of [context([]), null]) {
      const host = renderBanner({ context: lookup, selected: null, register: null, title: "Juan", crmBase: "https://crm.example", onSelect: () => {} });
      expect(shadow(host).textContent).toContain("SIN ASOCIAR"); expect(shadow(host).textContent).toContain(NO_MATCH);
      expect(shadow(host).querySelector<HTMLAnchorElement>(".body a")!.href).toBe("https://crm.example/accounts");
    }
  });
  it("offers an update only when a newer version is published or the server requires one", () => {
    expect(pendingUpdate({ context: { ...context(), latestVersion: "1.3.0" }, version: "1.2.0" })).toBe("1.3.0");
    expect(pendingUpdate({ context: { ...context(), latestVersion: "1.2.0" }, version: "1.2.0" })).toBeNull();
    expect(pendingUpdate({ context: { ...context(), latestVersion: "1.1.0" }, version: "1.2.0" })).toBeNull();
    expect(pendingUpdate({ context: null, version: "1.1.0", requiredVersion: "1.2.0" })).toBe("1.2.0");
    const host = renderBanner({ context: { ...context(), latestVersion: "1.3.0" }, selected: null, register: null, version: "1.2.0", crmBase: "https://crm.example", onSelect: () => {} });
    expect(shadow(host).textContent).toContain("Hay una versión nueva del script (1.3.0)");
    expect(shadow(host).querySelector<HTMLAnchorElement>(".update a")!.href).toBe("https://crm.example/userscripts/hospeda-crm.user.js");
    expect(shadow(host).querySelector(".launcher")!.getAttribute("aria-label")).toContain("Hay una actualización");
  });
  it("follows WhatsApp's theme in auto mode and honours a forced theme", () => {
    document.body.classList.add("dark");
    expect(isDark()).toBe(true); expect(renderBanner({ context: null, selected: null, register: null, onSelect: () => {} }).classList.contains("dark")).toBe(true);
    gmValues.set("hospeda-userscript-theme", "light"); expect(isDark()).toBe(false);
    document.body.classList.remove("dark"); gmValues.set("hospeda-userscript-theme", "dark"); expect(isDark()).toBe(true);
  });
  it("keeps its own prefixed tokens and host tag, so WhatsApp's --primary cannot recolor the panel", () => {
    expect(PANEL_CSS).not.toMatch(/--(?!hc-)[a-z]/);
    expect(renderBanner({ context: null, selected: null, register: null, onSelect: () => {} }).tagName).toBe("HOSPEDA-CRM");
  });
  it("warns before the preview that a new business only records received messages", () => {
    const host = renderBanner({ context: context(), selected: { ...match, status: "new", statusLabel: "Nuevo" }, register: null, title: "Cabañas", onSelect: () => {} });
    expect(shadow(host).textContent).toContain("En estado Nuevo solo se registran los mensajes recibidos");
  });
  it("refuses to open the preview when the chat changed since the panel was rendered", () => {
    const readMessages = vi.fn(() => [message("A1", "in", "Hola")]);
    const host = renderBanner({ context: context(), selected: match, register: new RegisterController("https://crm.example", "hcu_test"), title: "Cabañas del Río · H1234", phone: null, readMessages, isCurrentChat: () => false, onSelect: () => {} });
    readMessages.mockClear(); button(host, "Registrar mensajes")!.click();
    expect(readMessages).not.toHaveBeenCalled();
    expect(shadow(host).textContent).toContain("El chat cambió");
    expect(shadow(host).querySelector(".list")).toBeNull();
  });
  it("previews, counts the selection and registers only the chosen messages", async () => {
    const register = new RegisterController("https://crm.example", "hcu_test");
    const submit = vi.spyOn(register, "submit").mockResolvedValue([{ externalId: "A1", status: "created" }]);
    const host = renderBanner({ context: context(), selected: match, register, title: "Cabañas del Río · H1234", phone: "+5493442123456", readMessages: () => [message("A1", "out", "Hola"), message("A2", "in", "Buenas")], isCurrentChat: () => true, onSelect: () => {} });
    expect(shadow(host).querySelector<HTMLButtonElement>(".launcher")?.getAttribute("aria-label")).toContain("H1234 · 2 nuevos");
    button(host, "Registrar mensajes")!.click();
    expect(shadow(host).textContent).toContain("1 enviado"); expect(shadow(host).textContent).toContain("1 recibido");
    const rows = [...shadow(host).querySelectorAll<HTMLInputElement>(".row input")]; rows[1]!.click();
    expect(shadow(host).textContent).toContain("1 de 2 seleccionados");
    button(host, "Registrar 1 mensaje")!.click(); await vi.waitFor(() => expect(shadow(host).textContent).toContain("1 registrados"));
    expect(submit).toHaveBeenCalledWith("1234", { title: "Cabañas del Río · H1234", phone: "+5493442123456" }, [message("A1", "out", "Hola")]);
    expect(button(host, "Cerrar")).toBeTruthy();
  });
  it("waits hidden for WhatsApp's rail instead of floating first and jumping", () => {
    vi.useFakeTimers(); waitForRail(5000);
    const launcher = () => document.getElementById("hospeda-userscript-banner")!.shadowRoot!.querySelector<HTMLElement>(".launcher")!;
    renderBanner({ context: null, selected: null, register: null, onSelect: () => {} });
    expect(launcher().classList.contains("waiting")).toBe(true); expect(launcher().classList.contains("rail")).toBe(false);
    const footer = document.createElement("div"); footer.dataset.testid = "navbar-footer-section"; document.body.append(footer);
    footer.getBoundingClientRect = () => ({ top: 701, left: 12, width: 40, height: 100, bottom: 801, right: 52, x: 12, y: 701, toJSON: () => ({}) });
    vi.advanceTimersByTime(300);
    expect(launcher().classList.contains("rail")).toBe(true); expect(launcher().classList.contains("waiting")).toBe(false);
    footer.remove(); waitForRail(0); vi.useRealTimers();
  });
  it("ignores the rail while WhatsApp still draws it off screen and follows it once it settles", () => {
    vi.useFakeTimers(); waitForRail(5000);
    const footer = document.createElement("div"); footer.dataset.testid = "navbar-footer-section"; document.body.append(footer);
    let left = -379; footer.getBoundingClientRect = () => ({ top: 701, left, width: 40, height: 100, bottom: 801, right: left + 40, x: left, y: 701, toJSON: () => ({}) });
    renderBanner({ context: null, selected: null, register: null, onSelect: () => {} });
    const launcher = () => document.getElementById("hospeda-userscript-banner")!.shadowRoot!.querySelector<HTMLElement>(".launcher")!;
    expect(launcher().classList.contains("waiting")).toBe(true);
    left = 12; vi.advanceTimersByTime(300); expect(launcher().style.left).toBe("12px");
    left = 20; vi.advanceTimersByTime(1100); expect(launcher().style.left).toBe("20px");
    footer.remove(); waitForRail(0); vi.useRealTimers();
  });
  it("floats the launcher once the wait for the rail runs out", () => {
    vi.useFakeTimers(); waitForRail(1000);
    renderBanner({ context: null, selected: null, register: null, onSelect: () => {} });
    vi.advanceTimersByTime(1300);
    const launcher = document.getElementById("hospeda-userscript-banner")!.shadowRoot!.querySelector<HTMLElement>(".launcher")!;
    expect(launcher.classList.contains("waiting")).toBe(false); expect(launcher.classList.contains("rail")).toBe(false);
    waitForRail(0); vi.useRealTimers();
  });
  it("lays the launcher over WhatsApp's left rail when it is on screen, else floats it", () => {
    const floating = renderBanner({ context: null, selected: null, register: null, onSelect: () => {} }).shadowRoot!.querySelector<HTMLElement>(".launcher")!;
    expect(floating.classList.contains("rail")).toBe(false);
    const footer = document.createElement("div"); footer.dataset.testid = "navbar-footer-section"; document.body.append(footer);
    footer.getBoundingClientRect = () => ({ left: 12, top: 701, right: 52, bottom: 829, width: 40, height: 128, x: 12, y: 701, toJSON: () => ({}) }) as DOMRect;
    const rail = renderBanner({ context: null, selected: null, register: null, onSelect: () => {} }).shadowRoot!.querySelector<HTMLElement>(".launcher")!;
    expect(rail.classList.contains("rail")).toBe(true); expect([rail.style.left, rail.style.top]).toEqual(["12px", "649px"]);
    expect(footer.contains(rail)).toBe(false); footer.remove();
  });
  it("minimizes to the launcher and reopens", () => {
    const host = renderBanner({ context: null, selected: null, register: null, onSelect: () => {} });
    shadow(host).querySelector<HTMLButtonElement>("button[aria-label='Minimizar']")!.click();
    expect(shadow(host).querySelector(".panel")).toBeNull();
    shadow(host).querySelector<HTMLButtonElement>(".launcher")!.click(); expect(shadow(host).querySelector(".panel")).not.toBeNull();
  });
});

describe("open WhatsApp notice", () => {
  const out = { externalId: "true_1", direction: "out" as const, text: "Hola", sentAt: null, author: null };
  const incoming = { ...out, externalId: "false_1", direction: "in" as const };
  const now = new Date("2026-10-23T15:00:00.000Z").getTime();
  it("warns only when an attempt is open and the preview has a sent message", () => {
    expect(openWhatsappNotice(undefined, [out], now)).toBeNull();
    expect(openWhatsappNotice([], [out], now)).toBeNull();
    expect(openWhatsappNotice([{ openedAt: "2026-10-23T13:15:00.000Z" }], [incoming], now)).toBeNull();
    expect(openWhatsappNotice([{ openedAt: "2026-10-23T13:15:00.000Z" }], [out], now)).toMatch(/^Tenés un WhatsApp abierto desde el CRM .* no se registra dos veces\.$/);
    expect(openWhatsappNotice([{ openedAt: "2026-10-23T13:15:00.000Z" }, { openedAt: "2026-10-23T14:00:00.000Z" }], [out], now)).toMatch(/^Tenés 2 WhatsApp abiertos/);
  });
  it("counts only attempts the CRM would complete: opened within 24 h before a previewed send", () => {
    expect(openWhatsappNotice([{ openedAt: "2026-10-20T15:00:00.000Z" }], [out], now)).toBeNull();
    expect(openWhatsappNotice([{ openedAt: "2026-10-20T15:00:00.000Z" }], [{ ...out, sentAt: "2026-10-21T10:00:00.000Z" }], now)).toMatch(/^Tenés un WhatsApp abierto/);
    expect(openWhatsappNotice([{ openedAt: "2026-10-23T16:00:00.000Z" }], [out], now)).toBeNull();
  });
});

describe("CRM page announcement", () => {
  it("marks the page with the installed version and notifies it", () => {
    const listener = vi.fn(); document.addEventListener(INSTALLED_EVENT, listener);
    announceInstalled(document);
    expect(document.documentElement.getAttribute(INSTALLED_ATTRIBUTE)).toBe(USERSCRIPT_VERSION); expect(listener).toHaveBeenCalledTimes(1);
    document.removeEventListener(INSTALLED_EVENT, listener); document.documentElement.removeAttribute(INSTALLED_ATTRIBUTE);
  });
});

describe("proactive update prompt", () => {
  beforeEach(() => { gmValues.clear(); resetUpdatePrompt(); });
  const prompt = () => document.getElementById(UPDATE_PROMPT_ID)?.shadowRoot ?? null;
  const button = (root: ShadowRoot, text: string) => [...root.querySelectorAll("button")].find(item => item.textContent === text)!;
  const show = (input: { latest?: string | null; required?: string | null }) => showUpdatePrompt({ installed: "1.2.0", crmBase: "https://crm.example", dark: false, ...input });
  it("appears for a newer published version and links to the served script", () => {
    expect(show({ latest: "1.2.0" })).toBeNull(); expect(show({ latest: "1.1.9" })).toBeNull();
    show({ latest: "1.3.0" });
    expect(prompt()!.textContent).toContain("Hay una versión nueva de Hospeda");
    expect(prompt()!.querySelector<HTMLAnchorElement>("a.btn.primary")!.href).toBe("https://crm.example/userscripts/hospeda-crm.user.js");
  });
  it("snoozes a version for a day across page loads, but asks again for a newer one", () => {
    show({ latest: "1.3.0" }); button(prompt()!, "Más tarde").click();
    expect(document.getElementById(UPDATE_PROMPT_ID)).toBeNull();
    resetUpdatePrompt(); expect(show({ latest: "1.3.0" })).toBeNull();
    expect(show({ latest: "1.4.0" })).not.toBeNull();
  });
  it("never snoozes a version the server already rejects beyond this page load", () => {
    show({ required: "1.3.0" }); expect(prompt()!.textContent).toContain("ya no funciona con el CRM");
    button(prompt()!, "Más tarde").click(); expect(show({ required: "1.3.0" })).toBeNull();
    resetUpdatePrompt(); expect(show({ required: "1.3.0" })).not.toBeNull();
  });
  it("is rendered once per version instead of stacking on every check", () => {
    show({ latest: "1.3.0" }); show({ latest: "1.3.0" });
    expect(document.querySelectorAll(`#${UPDATE_PROMPT_ID}`)).toHaveLength(1);
  });
  it("checks again on returning to the tab, but not on every quick switch", () => {
    let now = 0; const check = vi.fn(), onVisible = throttled(check, 120_000, () => now);
    onVisible(); now = 30_000; onVisible(); expect(check).toHaveBeenCalledTimes(1);
    now = 130_000; onVisible(); expect(check).toHaveBeenCalledTimes(2);
  });
});
