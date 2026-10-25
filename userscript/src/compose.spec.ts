import { NOT_SENT_BY_SCRIPT, PASTE_FAILED, openCompose } from "./compose";
import { ApiError, dispatchTemplate, fetchTemplates, markTemplateNotSent, prepareTemplate, type Match, type TemplatesResponse } from "./api";
import type { UiOptions } from "./ui";

vi.mock("./api", async original => ({ ApiError: (await original<typeof import("./api")>()).ApiError, fetchTemplates: vi.fn(), prepareTemplate: vi.fn(), dispatchTemplate: vi.fn(), markTemplateNotSent: vi.fn() }));

const match: Match = { accountId: "7", code: "H7", name: "Cabañas del Río", city: "Colón", status: "reviewed", statusLabel: "Revisado", assignedUserName: null, doNotContact: false, restrictionActive: false, archived: false, leads: [], url: "https://crm.example/accounts/7" };
const listing = (overrides: Partial<TemplatesResponse> = {}): TemplatesResponse => ({
  blocked: null,
  leads: [{ id: "10", name: "Primer contacto", type: "hospedaje", stage: "Nueva", templates: [{ id: "1", name: "Seguimiento", recommended: false, body: "Hola {{contacto}},\nte escribo por {{nombre}}." }, { id: "2", name: "Primer contacto · Hospedaje", recommended: true, body: "Hola" }], contacts: [{ id: "5", name: "Marcela", phone: "+54 9 3442 45-3797", default: true }] }],
  ...overrides,
});
const prepared = (overrides = {}) => ({ messageId: "m-1", revision: 1, body: "Hola Marcela, soy Ana de Hospeda.", recipient: "+5493442453797", recipientName: "Marcela", unresolved: [], ...overrides });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const buttonNamed = (card: HTMLElement, text: string) => [...card.querySelectorAll("button")].find(item => item.textContent === text)!;

const gm = new Map<string, unknown>();
let card: HTMLElement, composer: HTMLElement, sendButton: HTMLButtonElement, back: ReturnType<typeof vi.fn>;
async function open(options: Partial<UiOptions> = {}): Promise<void> {
  openCompose(card, { crmBase: "https://crm.example", phone: "+54 9 3442 45-3797", isCurrentChat: () => true, context: null, selected: match, register: null, onSelect: () => {}, ...options }, match, back, title => { const bar = document.createElement("div"); bar.className = "bar"; bar.textContent = title; return bar; });
  await flush(); await flush();
}

beforeEach(() => {
  gm.clear(); vi.stubGlobal("GM_getValue", (key: string, fallback: unknown) => gm.get(key) ?? (fallback === "" ? "hcu_test" : fallback)); vi.stubGlobal("GM_setValue", (key: string, value: unknown) => gm.set(key, value));
  vi.mocked(fetchTemplates).mockResolvedValue(listing()); vi.mocked(prepareTemplate).mockResolvedValue(prepared()); vi.mocked(dispatchTemplate).mockResolvedValue({}); vi.mocked(markTemplateNotSent).mockResolvedValue({});
  document.body.innerHTML = '<div id="main"><footer><div contenteditable="true"></div><button data-testid="send">Enviar</button></footer></div>';
  composer = document.querySelector<HTMLElement>("footer [contenteditable]")!; sendButton = document.querySelector<HTMLButtonElement>("[data-testid='send']")!;
  // jsdom has no editing commands: emulate the browser inserting text into the focused contenteditable.
  document.execCommand = vi.fn((command: string, _ui?: boolean, value?: string) => { if (command === "delete") { composer.textContent = ""; return true; } if (command === "insertLineBreak") { composer.textContent += "\n"; return true; } if (command !== "insertText") return false; composer.textContent += value ?? ""; return true; });
  card = document.createElement("section"); document.body.append(card); back = vi.fn();
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe("compose view", () => {
  it("preselects the recommended model and default person and previews the CRM text", async () => {
    await open();
    expect(prepareTemplate).toHaveBeenCalledWith("https://crm.example", "hcu_test", expect.objectContaining({ leadId: "10", templateId: "2", contactId: "5" }));
    const radios = [...card.querySelectorAll<HTMLInputElement>("input[type=radio]")];
    expect(radios.map(radio => radio.checked)).toEqual([false, true]);
    expect(card.textContent).toContain("Recomendado para la etapa actual"); expect(card.textContent).toContain("Hola Marcela, soy Ana de Hospeda."); expect(card.textContent).toContain(NOT_SENT_BY_SCRIPT);
  });
  it("marks WhatsApp as opened, writes into the empty composer and never sends", async () => {
    const sendClick = vi.fn(), keys = vi.fn(); sendButton.addEventListener("click", sendClick); document.addEventListener("keydown", keys, true);
    await open(); buttonNamed(card, "Pegar en el chat").click(); await flush(); await flush();
    expect(dispatchTemplate).toHaveBeenCalledWith("https://crm.example", "hcu_test", { id: "m-1", revision: 1 });
    expect(composer.textContent).toBe("Hola Marcela, soy Ana de Hospeda.");
    expect(card.querySelector(".bar")!.textContent).toBe("Listo, está en el chat");
    expect(sendClick).not.toHaveBeenCalled(); expect(keys).not.toHaveBeenCalled();
  });
  it("refuses to paste after a chat switch or into a chat with another phone", async () => {
    await open({ isCurrentChat: () => false }); buttonNamed(card, "Pegar en el chat").click(); await flush();
    expect(card.textContent).toContain("El chat cambió"); expect(dispatchTemplate).not.toHaveBeenCalled(); expect(composer.textContent).toBe("");
    await open({ phone: "+54 9 11 5555-0101" }); buttonNamed(card, "Pegar en el chat").click(); await flush();
    expect(card.textContent).toContain("no coincide con la persona elegida"); expect(dispatchTemplate).not.toHaveBeenCalled();
  });
  it("keeps the line breaks of a multi-line model and only uses soft line breaks", async () => {
    vi.mocked(prepareTemplate).mockResolvedValue(prepared({ body: "Hola Marcela,\n\nsoy Ana de Hospeda." }));
    await open(); buttonNamed(card, "Pegar en el chat").click(); await flush(); await flush();
    expect(composer.textContent).toBe("Hola Marcela,\n\nsoy Ana de Hospeda.");
    expect(vi.mocked(document.execCommand).mock.calls.map(call => call[0])).toEqual(["insertText", "insertLineBreak", "insertLineBreak", "insertText"]);
  });
  it("previews the raw model next to the panel on hover, without preparing it", async () => {
    const panel = document.createElement("div"); panel.className = "panel"; card.replaceWith(panel); panel.append(card);
    await open(); const calls = vi.mocked(prepareTemplate).mock.calls.length;
    const row = card.querySelectorAll<HTMLElement>(".row")[0]!; row.dispatchEvent(new MouseEvent("mouseenter"));
    const pop = panel.querySelector(".popover")!;
    expect(pop.textContent).toBe("SeguimientoHola {{contacto}},\nte escribo por {{nombre}}."); expect([...pop.querySelectorAll("mark")].map(m => m.textContent)).toEqual(["{{contacto}}", "{{nombre}}"]);
    expect(prepareTemplate).toHaveBeenCalledTimes(calls);
    row.dispatchEvent(new MouseEvent("mouseleave")); expect(panel.querySelector(".popover")).toBeNull();
  });
  it("keeps the buttons in a footer outside the scrolling list", async () => {
    await open();
    expect(card.querySelector(".footer")!.textContent).toContain("Pegar en el chat"); expect(card.querySelector(".body")!.textContent).not.toContain("Pegar en el chat");
  });
  it("asks before replacing what the seller typed, and keeps it on cancel", async () => {
    composer.textContent = "borrador propio";
    await open(); buttonNamed(card, "Pegar en el chat").click(); await flush();
    expect(card.textContent).toContain("no pegó el script"); expect(composer.textContent).toBe("borrador propio"); expect(dispatchTemplate).not.toHaveBeenCalled();
    buttonNamed(card, "Cancelar").click();
    expect(composer.textContent).toBe("borrador propio"); expect(buttonNamed(card, "Pegar en el chat")).toBeTruthy();
    buttonNamed(card, "Pegar en el chat").click(); await flush(); buttonNamed(card, "Reemplazar").click(); await flush(); await flush();
    expect(composer.textContent).toBe("Hola Marcela, soy Ana de Hospeda."); expect(card.querySelector(".bar")!.textContent).toBe("Listo, está en el chat");
  });
  it("replaces its own pasted model without asking and closes that attempt as not sent", async () => {
    await open(); buttonNamed(card, "Pegar en el chat").click(); await flush(); await flush();
    buttonNamed(card, "Cambiar de modelo").click();
    vi.mocked(prepareTemplate).mockResolvedValue(prepared({ messageId: "m-2", body: "Otro modelo para Marcela." }));
    card.querySelectorAll<HTMLInputElement>("input[type=radio]")[0]!.click(); await flush();
    buttonNamed(card, "Pegar en el chat").click(); await flush(); await flush();
    expect(card.textContent).not.toContain("no pegó el script"); expect(markTemplateNotSent).toHaveBeenCalledWith("https://crm.example", "hcu_test", "m-1");
    expect(composer.textContent).toBe("Otro modelo para Marcela.");
  });
  it("remembers its paste across a reload and closes it when the seller edited it and confirms the replacement", async () => {
    await open(); buttonNamed(card, "Pegar en el chat").click(); await flush(); await flush();
    composer.textContent = composer.textContent!.replace("soy Ana", "te habla Ana");
    vi.mocked(prepareTemplate).mockResolvedValue(prepared({ messageId: "m-2", body: "Otro modelo." }));
    card = document.createElement("section"); document.body.append(card); await open(); // a fresh panel, as after reloading WhatsApp
    buttonNamed(card, "Pegar en el chat").click(); await flush(); expect(card.textContent).toContain("no pegó el script");
    buttonNamed(card, "Reemplazar").click(); await flush(); await flush();
    expect(markTemplateNotSent).toHaveBeenCalledWith("https://crm.example", "hcu_test", "m-1"); expect(composer.textContent).toBe("Otro modelo.");
  });
  it("still replaces when the earlier attempt was already resolved in the CRM", async () => {
    await open(); buttonNamed(card, "Pegar en el chat").click(); await flush(); await flush();
    vi.mocked(markTemplateNotSent).mockRejectedValue(new ApiError("Este intento ya fue completado.", 409));
    buttonNamed(card, "Cambiar de modelo").click(); vi.mocked(prepareTemplate).mockResolvedValue(prepared({ messageId: "m-2", body: "Otro modelo." }));
    card.querySelectorAll<HTMLInputElement>("input[type=radio]")[0]!.click(); await flush();
    buttonNamed(card, "Pegar en el chat").click(); await flush(); await flush();
    expect(composer.textContent).toBe("Otro modelo.");
  });
  it("asks before replacing its own paste once the seller added text to it", async () => {
    await open(); buttonNamed(card, "Pegar en el chat").click(); await flush(); await flush();
    composer.textContent += " Te llamo mañana.";
    buttonNamed(card, "Cambiar de modelo").click(); buttonNamed(card, "Pegar en el chat").click(); await flush();
    expect(card.textContent).toContain("no pegó el script"); expect(composer.textContent).toContain("Te llamo mañana.");
  });
  it("does not write when the chat changes while the CRM is answering", async () => {
    let current = true;
    vi.mocked(dispatchTemplate).mockImplementation(async () => { current = false; return {}; });
    await open({ isCurrentChat: () => current }); buttonNamed(card, "Pegar en el chat").click(); await flush(); await flush();
    expect(card.textContent).toContain("El chat cambió"); expect(composer.textContent).toBe("");
  });
  it("does not write when the seller types while the CRM is answering", async () => {
    vi.mocked(dispatchTemplate).mockImplementation(async () => { composer.textContent = "escribí algo"; return {}; });
    await open(); buttonNamed(card, "Pegar en el chat").click(); await flush(); await flush();
    expect(card.textContent).toContain("La caja de WhatsApp cambió"); expect(composer.textContent).toBe("escribí algo");
  });
  it("offers to copy when it cannot write into the composer", async () => {
    await open(); vi.mocked(document.execCommand).mockReturnValue(false);
    buttonNamed(card, "Pegar en el chat").click(); await flush(); await flush();
    expect(card.textContent).toContain(PASTE_FAILED); expect(buttonNamed(card, "Copiar texto")).toBeTruthy(); expect(buttonNamed(card, "Reintentar")).toBeTruthy();
  });
  it("blocks pasting while a variable is missing or the CRM blocks the business", async () => {
    vi.mocked(prepareTemplate).mockResolvedValue(prepared({ body: "Hola {{contacto}}", unresolved: ["contacto"] }));
    await open();
    expect(card.querySelector("mark")!.textContent).toBe("{{contacto}}"); expect(buttonNamed(card, "Pegar en el chat").disabled).toBe(true);
    vi.mocked(fetchTemplates).mockResolvedValue(listing({ blocked: "El negocio tiene No contactar activo." })); vi.mocked(prepareTemplate).mockResolvedValue(prepared());
    await open();
    expect(card.textContent).toContain("No contactar activo"); expect(buttonNamed(card, "Pegar en el chat").disabled).toBe(true);
  });
  it("records «No lo voy a enviar» and goes back to the business", async () => {
    await open(); buttonNamed(card, "Pegar en el chat").click(); await flush(); await flush();
    buttonNamed(card, "No lo voy a enviar").click(); await flush();
    expect(markTemplateNotSent).toHaveBeenCalledWith("https://crm.example", "hcu_test", "m-1"); expect(back).toHaveBeenCalled();
  });
  it("prepares a new draft when the seller picks another model, and dispatches it only once", async () => {
    await open();
    card.querySelectorAll<HTMLInputElement>("input[type=radio]")[0]!.click(); await flush();
    expect(prepareTemplate).toHaveBeenLastCalledWith("https://crm.example", "hcu_test", expect.objectContaining({ templateId: "1" }));
    vi.mocked(document.execCommand).mockReturnValue(false); buttonNamed(card, "Pegar en el chat").click(); await flush(); await flush();
    buttonNamed(card, "Copiar texto").click(); await flush();
    expect(dispatchTemplate).toHaveBeenCalledTimes(1);
  });
});

describe("sentMatchesPrepared", () => {
  it("accepts the prepared text and small edits, and rejects a message written by hand", async () => {
    const { sentMatchesPrepared } = await import("./textMatch");
    const model = "Hola Marcela, ¿cómo estás? Soy Ana, de Hospeda. Te escribo por Cabañas del Río para contarte cómo funciona la plataforma.";
    expect(sentMatchesPrepared(model, model)).toBe(true);
    expect(sentMatchesPrepared(model, model.replace("Hola Marcela", "Buen día Marcela") + "\nCualquier duda me avisás.")).toBe(true);
    expect(sentMatchesPrepared(model, "Te llamo mañana a la tarde, dale?")).toBe(false);
    expect(sentMatchesPrepared(null, "Cualquier texto")).toBe(true);
  });
});
