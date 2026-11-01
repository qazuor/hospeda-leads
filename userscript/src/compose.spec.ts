import { NOT_SENT_BY_SCRIPT, PASTE_FAILED, openCompose } from "./compose";
import { attachToChat } from "./attach";
import { ApiError, addMaterial, dispatchTemplate, fetchMaterialFile, fetchMaterials, fetchTemplates, markTemplateNotSent, prepareTemplate, removeMaterial, type Match, type MaterialFile, type TemplatesResponse } from "./api";
import type { UiOptions } from "./ui";

vi.mock("./api", async original => ({ ...(await original<typeof import("./api")>()), fetchTemplates: vi.fn(), prepareTemplate: vi.fn(), dispatchTemplate: vi.fn(), markTemplateNotSent: vi.fn(), fetchMaterials: vi.fn(), addMaterial: vi.fn(), removeMaterial: vi.fn(), fetchMaterialFile: vi.fn() }));
vi.mock("./attach", async original => ({ ...(await original<typeof import("./attach")>()), attachToChat: vi.fn() }));

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
async function open(options: Partial<UiOptions> = {}, mode: "template" | "material" = "template"): Promise<void> {
  openCompose(card, { crmBase: "https://crm.example", phone: "+54 9 3442 45-3797", isCurrentChat: () => true, context: null, selected: match, register: null, onSelect: () => {}, ...options }, match, back, title => { const bar = document.createElement("div"); bar.className = "bar"; bar.textContent = title; return bar; }, mode);
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

describe("compose view sales material (spec 89 §9)", () => {
  const folleto = { id: "11111111-1111-4111-8111-111111111111", title: "Folleto 2027", categories: ["Folletos"], format: "pdf", formatLabel: "PDF" };
  const tour = { id: "22222222-2222-4222-8222-222222222222", title: "Tour 360", categories: [], format: "link", formatLabel: "Enlace externo" };
  it("shows the model's material that the CRM left out", async () => {
    vi.mocked(prepareTemplate).mockResolvedValue(prepared({ materialWarnings: ["«Precios 2026» ya no está disponible. No se agregó al mensaje."] }));
    await open();
    expect(card.textContent).toContain("«Precios 2026» ya no está disponible. No se agregó al mensaje.");
  });
  it("adds a material to the draft, previews the new text and pastes it with the new revision", async () => {
    vi.mocked(fetchMaterials).mockResolvedValueOnce({ materials: [folleto, tour], blocked: null }).mockResolvedValueOnce({ materials: [tour], blocked: null });
    vi.mocked(addMaterial).mockResolvedValue({ revision: 2, body: "Hola Marcela, soy Ana de Hospeda.\n\nTour 360: https://crm.example/m/abc" });
    await open(); buttonNamed(card, "Agregar material").click(); await flush(); await flush();
    expect(fetchMaterials).toHaveBeenCalledWith("https://crm.example", "hcu_test", "7", "");
    const search = card.querySelector<HTMLInputElement>("input[type=search]")!; search.value = "tour"; search.dispatchEvent(new Event("input"));
    await new Promise(resolve => setTimeout(resolve, 350)); await flush();
    expect(fetchMaterials).toHaveBeenLastCalledWith("https://crm.example", "hcu_test", "7", "tour");
    expect(card.textContent).toContain("Tour 360"); expect(card.textContent).not.toContain("Folleto 2027");
    buttonNamed(card, "Agregar").click(); await flush(); await flush();
    expect(addMaterial).toHaveBeenCalledWith("https://crm.example", "hcu_test", { messageId: "m-1", revision: 1, materialId: tour.id });
    expect(card.querySelector(".box")!.textContent).toContain("Tour 360: https://crm.example/m/abc");
    buttonNamed(card, "Pegar en el chat").click(); await flush(); await flush();
    expect(dispatchTemplate).toHaveBeenCalledWith("https://crm.example", "hcu_test", { id: "m-1", revision: 2 });
    expect(composer.textContent).toContain("Tour 360: https://crm.example/m/abc");
  });
  it("shows why material cannot be added to a blocked business and asks again on the next opening (regression)", async () => {
    vi.mocked(fetchMaterials).mockResolvedValueOnce({ materials: [], blocked: "El negocio tiene No contactar activo." }).mockResolvedValueOnce({ materials: [folleto], blocked: null });
    await open(); buttonNamed(card, "Agregar material").click(); await flush(); await flush();
    expect(card.textContent).toContain("El negocio tiene No contactar activo."); expect(addMaterial).not.toHaveBeenCalled();
    buttonNamed(card, "Cerrar").click(); buttonNamed(card, "Agregar material").click(); await flush(); await flush();
    expect(fetchMaterials).toHaveBeenCalledTimes(2); expect(card.textContent).toContain("Folleto 2027"); expect(card.textContent).not.toContain("No contactar activo");
  });
  it("keeps the draft and offers a retry when the CRM refuses the material", async () => {
    vi.mocked(fetchMaterials).mockResolvedValue({ materials: [folleto], blocked: null });
    vi.mocked(addMaterial).mockRejectedValue(new ApiError("«Folleto 2027» ya no está disponible.", 409));
    await open(); buttonNamed(card, "Agregar material").click(); await flush(); await flush();
    buttonNamed(card, "Agregar").click(); await flush(); await flush();
    expect(card.textContent).toContain("«Folleto 2027» ya no está disponible."); expect(card.querySelector(".box")!.textContent).toBe("Hola Marcela, soy Ana de Hospeda.");
    expect(buttonNamed(card, "Agregar").disabled).toBe(false);
  });
});

describe("«Enviar material» in the WhatsApp panel (spec 98 §4.1)", () => {
  const folleto = { id: "11111111-1111-4111-8111-111111111111", title: "Folleto 2027", categories: ["Folletos"], format: "pdf", formatLabel: "PDF" };
  const tour = { id: "22222222-2222-4222-8222-222222222222", title: "Tour 360", categories: [], format: "link", formatLabel: "Enlace externo" };
  const link = "Podés ver «Folleto 2027» en: https://crm.example/m/abc", held = { shareId: "s-1", materialId: "11111111-1111-4111-8111-111111111111", title: "Folleto 2027" };
  const heldTitles = () => [...card.querySelectorAll(".held-materials .row .content")].map(node => node.textContent);
  const pick = async (name = "Folleto 2027") => { const row = [...card.querySelectorAll(".row")].find(item => item.textContent?.includes(name))!; row.querySelector("button")!.click(); await flush(); await flush(); await flush(); };
  beforeEach(() => { vi.mocked(fetchMaterials).mockResolvedValue({ materials: [folleto, tour], blocked: null }); vi.mocked(prepareTemplate).mockResolvedValue(prepared({ body: "" })); vi.mocked(addMaterial).mockResolvedValue({ revision: 2, body: link, materials: [held] }); });

  it("renders the exact §5.3 attach notice, formatting size with formatSize", async () => {
    const attached={...held,attach:{eligible:true,reason:null,fileName:"Folleto 2027.pdf",mimeType:"application/pdf",byteSize:1024,kind:"document" as const}};
    vi.mocked(addMaterial).mockResolvedValueOnce({revision:2,body:link,materials:[attached]});
    await open({},"material");await pick();
    expect(card.querySelector(".note.info")?.textContent).toBe("Va el archivo «Folleto 2027» (1 KB) con el texto como descripción.");
  });
  it.each([401,403,404,409])( "offers the exact manual link fallback after HTTP %i download failure", async status => {
    const attached={...held,attach:{eligible:true,reason:null,fileName:"Folleto 2027.pdf",mimeType:"application/pdf",byteSize:4,kind:"document" as const}};
    vi.mocked(addMaterial).mockResolvedValueOnce({revision:2,body:link,materials:[attached]});
    vi.mocked(fetchMaterialFile).mockImplementation(()=>({promise:new Promise((_resolve,reject)=>setTimeout(()=>reject(new ApiError(`HTTP ${status}`,status)),5)),abort:vi.fn()}));
    const title=document.createElement("span");title.dataset.testid="conversation-info-header-chat-title";title.textContent="+5493442453797";const header=document.createElement("header");header.append(title);document.querySelector("#main")!.prepend(header);
    await open({},"material");await pick();buttonNamed(card,"Pegar en el chat").click();await new Promise(resolve=>setTimeout(resolve,10));await flush();
    expect(card.textContent).toContain(`HTTP ${status}`);buttonNamed(card,"Pegar solo con el enlace").click();await flush();await flush();
    expect(composer.textContent).toBe(link);expect(card.querySelector(".bar")?.textContent).toBe("Listo, está en el chat");expect(buttonNamed(card,"Pegar solo con el enlace")).toBeUndefined();
  });
  it("does not announce «Listo» when text restoration fails after attachment",async()=>{
    const attached={...held,attach:{eligible:true,reason:null,fileName:"Folleto 2027.pdf",mimeType:"application/pdf",byteSize:4,kind:"document" as const}};vi.mocked(addMaterial).mockResolvedValueOnce({revision:2,body:link,materials:[attached]});
    vi.mocked(fetchMaterialFile).mockReturnValue({promise:Promise.resolve({file:new File(["data"],"Folleto 2027.pdf",{type:"application/pdf"}),version:"1"}),abort:vi.fn()});
    vi.mocked(attachToChat).mockResolvedValueOnce({state:"error",message:"No pude adjuntar el archivo en WhatsApp: no quedó pegado el texto con el enlace."});
    const title=document.createElement("span");title.dataset.testid="conversation-info-header-chat-title";title.textContent="+5493442453797";const header=document.createElement("header");header.append(title);document.querySelector("#main")!.prepend(header);
    await open({},"material");await pick();buttonNamed(card,"Pegar en el chat").click();await flush();await flush();
    expect(card.textContent).toContain("No pude adjuntar el archivo en WhatsApp: no quedó pegado el texto con el enlace.");expect(card.querySelector(".bar")?.textContent).not.toBe("Listo, está en el chat");expect(buttonNamed(card,"Pegar solo con el enlace")).toBeTruthy();
  });
  it("aborts when the chat changes during download and pastes nothing",async()=>{
    const attached={...held,attach:{eligible:true,reason:null,fileName:"Folleto 2027.pdf",mimeType:"application/pdf",byteSize:4,kind:"document" as const}};vi.mocked(addMaterial).mockResolvedValueOnce({revision:2,body:link,materials:[attached]});
    const title=document.createElement("span");title.dataset.testid="conversation-info-header-chat-title";title.textContent="+5493442453797";const header=document.createElement("header");header.append(title);document.querySelector("#main")!.prepend(header);
    let resolveDownload!:(value:MaterialFile)=>void;vi.mocked(fetchMaterialFile).mockReturnValue({promise:new Promise(resolve=>{resolveDownload=resolve;}),abort:vi.fn()});
    await open({},"material");await pick();buttonNamed(card,"Pegar en el chat").click();await flush();title.textContent="+5491155550101";resolveDownload({file:new File(["data"],"Folleto 2027.pdf",{type:"application/pdf"}),version:"1"});await flush();await flush();
    expect(card.textContent).toContain("No pegué nada");expect(dispatchTemplate).not.toHaveBeenCalled();expect(composer.textContent).toBe("");expect(buttonNamed(card,"Pegar solo con el enlace")).toBeUndefined();
  });

  it("opens on the picker and prepares nothing until a material is chosen", async () => {
    await open({}, "material");
    expect(card.querySelector(".bar")!.textContent).toBe("Enviar material"); expect(card.textContent).toContain("ELEGÍ EL MATERIAL");
    expect(card.querySelectorAll("input[type=radio]")).toHaveLength(0); expect(prepareTemplate).not.toHaveBeenCalled();
  });
  it("prepares a free draft in the default scope, adds the material and pastes its link without sending", async () => {
    await open({}, "material"); await pick();
    expect(prepareTemplate).toHaveBeenCalledWith("https://crm.example", "hcu_test", expect.objectContaining({ leadId: "10", contactId: "5", templateId: null }));
    expect(addMaterial).toHaveBeenCalledWith("https://crm.example", "hcu_test", { messageId: "m-1", revision: 1, materialId: folleto.id });
    expect(card.querySelector(".box")!.textContent).toBe(link); expect(heldTitles()).toEqual(["Folleto 2027"]);
    expect(card.querySelector(".held-materials")!.compareDocumentPosition(card.querySelector(".box")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const model = [...card.querySelectorAll("select")].find(select => [...select.options].some(option => option.text === "Mensaje libre"))!;
    expect([...model.options].map(option => option.text)).toEqual(["Mensaje libre", "Seguimiento", "Primer contacto · Hospedaje"]);
    buttonNamed(card, "Pegar en el chat").click(); await flush(); await flush();
    expect(dispatchTemplate).toHaveBeenCalledWith("https://crm.example", "hcu_test", { id: "m-1", revision: 2 }); expect(composer.textContent).toBe(link);
  });
  it("switching to a model prepares that draft and re-adds the material (D2); a reused draft that holds it is not added twice", async () => {
    await open({}, "material"); await pick();
    vi.mocked(prepareTemplate).mockResolvedValueOnce(prepared({ messageId: "m-2", body: "Hola Marcela" })); vi.mocked(addMaterial).mockResolvedValueOnce({ revision: 2, body: `Hola Marcela\n\n${link}` });
    const model = [...card.querySelectorAll("select")].find(select => [...select.options].some(option => option.text === "Mensaje libre"))!;
    model.value = "1"; model.dispatchEvent(new Event("change")); await flush(); await flush(); await flush();
    expect(prepareTemplate).toHaveBeenLastCalledWith("https://crm.example", "hcu_test", expect.objectContaining({ templateId: "1" }));
    expect(addMaterial).toHaveBeenLastCalledWith("https://crm.example", "hcu_test", { messageId: "m-2", revision: 1, materialId: folleto.id });
    vi.mocked(addMaterial).mockClear(); vi.mocked(prepareTemplate).mockResolvedValueOnce(prepared({ messageId: "m-1", revision: 2, body: link, materials: [{ materialId: folleto.id, title: "Folleto 2027" }] }));
    const again = [...card.querySelectorAll("select")].find(select => [...select.options].some(option => option.text === "Mensaje libre"))!;
    again.value = ""; again.dispatchEvent(new Event("change")); await flush(); await flush();
    expect(addMaterial).not.toHaveBeenCalled(); expect(card.querySelector(".box")!.textContent).toBe(link);
  });
  it("keeps the selection, disables the paste on an empty free draft and offers «Reintentar» when the CRM refuses the material", async () => {
    vi.mocked(addMaterial).mockRejectedValueOnce(new ApiError("El negocio tiene No contactar activo.", 403));
    await open({}, "material"); await pick();
    expect(card.textContent).toContain("El negocio tiene No contactar activo."); expect(card.textContent).toContain("Falta agregar: Folleto 2027.");
    expect(buttonNamed(card, "Pegar en el chat").disabled).toBe(true); expect(buttonNamed(card, "Copiar").disabled).toBe(true); expect(dispatchTemplate).not.toHaveBeenCalled();
    buttonNamed(card, "Reintentar").click(); await flush(); await flush();
    expect(addMaterial).toHaveBeenCalledTimes(2); expect(buttonNamed(card, "Pegar en el chat").disabled).toBe(false);
  });
  it("«Mandar un mensaje» keeps the added material when the seller switches model (D2)", async () => {
    vi.mocked(prepareTemplate).mockResolvedValue(prepared());
    await open(); buttonNamed(card, "Agregar material").click(); await flush(); await flush();
    await pick("Tour 360");
    vi.mocked(prepareTemplate).mockResolvedValueOnce(prepared({ messageId: "m-2" }));
    card.querySelectorAll<HTMLInputElement>("input[type=radio]")[0]!.click(); await flush(); await flush();
    expect(addMaterial).toHaveBeenLastCalledWith("https://crm.example", "hcu_test", { messageId: "m-2", revision: 1, materialId: tour.id });
  });
  it("«Quitar» removes the material from the draft; it is not re-added on a later switch and can be picked again", async () => {
    // Arrange
    await open({}, "material"); await pick();
    vi.mocked(removeMaterial).mockResolvedValueOnce({ revision: 3, body: "", materials: [] });
    // Act
    buttonNamed(card, "Quitar").click(); await flush(); await flush();
    // Assert
    expect(removeMaterial).toHaveBeenCalledWith("https://crm.example", "hcu_test", { messageId: "m-1", revision: 2, shareId: "s-1" });
    expect(card.querySelector(".held-materials")).toBeNull(); expect(buttonNamed(card, "Pegar en el chat").disabled).toBe(true);
    vi.mocked(addMaterial).mockClear(); vi.mocked(prepareTemplate).mockResolvedValueOnce(prepared({ messageId: "m-2", body: "Hola Marcela" }));
    const model = [...card.querySelectorAll("select")].find(select => [...select.options].some(option => option.text === "Mensaje libre"))!;
    model.value = "1"; model.dispatchEvent(new Event("change")); await flush(); await flush(); await flush();
    expect(addMaterial).not.toHaveBeenCalled();
    buttonNamed(card, "Agregar otro material").click(); await flush(); await flush();
    const row = [...card.querySelectorAll(".row")].find(item => item.textContent?.includes("Folleto 2027"))!;
    expect(row.querySelector("button")!.disabled).toBe(false);
  });
  it("a failed «Quitar» keeps the material with «Reintentar»; a revision conflict re-prepares and retries once", async () => {
    await open({}, "material"); await pick();
    vi.mocked(removeMaterial).mockRejectedValueOnce(new ApiError("No se pudo quitar.", 500));
    buttonNamed(card, "Quitar").click(); await flush(); await flush();
    expect(heldTitles()).toEqual(["Folleto 2027"]); expect(card.textContent).toContain("No se pudo quitar."); expect(buttonNamed(card, "Reintentar")).toBeTruthy();
    vi.mocked(removeMaterial).mockRejectedValueOnce(new ApiError("El borrador cambió.", 409)).mockResolvedValueOnce({ revision: 6, body: "", materials: [] });
    vi.mocked(prepareTemplate).mockResolvedValueOnce(prepared({ revision: 5, body: link, materials: [held] }));
    buttonNamed(card, "Reintentar").click(); await flush(); await flush(); await flush();
    expect(removeMaterial).toHaveBeenLastCalledWith("https://crm.example", "hcu_test", { messageId: "m-1", revision: 5, shareId: "s-1" });
    expect(card.querySelector(".held-materials")).toBeNull();
  });
  it("«Reintentar» after a revision conflict re-prepares the draft and adds with its fresh revision (review item 6)", async () => {
    const conflict = () => new ApiError("El borrador cambió.", 409);
    vi.mocked(addMaterial).mockRejectedValueOnce(conflict()).mockRejectedValueOnce(conflict()).mockRejectedValueOnce(conflict());
    await open({}, "material"); await pick();
    expect(prepareTemplate).toHaveBeenCalledTimes(2); // the pick, then one re-prepare on the first conflict
    expect(card.textContent).toContain("Falta agregar: Folleto 2027.");
    vi.mocked(prepareTemplate).mockResolvedValueOnce(prepared({ revision: 4, body: "" }));
    buttonNamed(card, "Reintentar").click(); await flush(); await flush(); await flush();
    expect(addMaterial).toHaveBeenLastCalledWith("https://crm.example", "hcu_test", { messageId: "m-1", revision: 4, materialId: folleto.id });
    expect(card.textContent).not.toContain("Falta agregar"); expect(buttonNamed(card, "Pegar en el chat").disabled).toBe(false);
  });
  it("a failed prepare keeps the chosen material and offers «Reintentar» (review item 2B)", async () => {
    vi.mocked(prepareTemplate).mockRejectedValueOnce(new ApiError("Servicio no disponible.", 503));
    await open({}, "material"); await pick();
    expect(card.textContent).toContain("Material elegido: Folleto 2027"); expect(card.textContent).toContain("Servicio no disponible."); expect(card.textContent).not.toContain("ELEGÍ EL MATERIAL");
    buttonNamed(card, "Reintentar").click(); await flush(); await flush(); await flush();
    expect(prepareTemplate).toHaveBeenCalledTimes(2); expect(addMaterial).toHaveBeenCalledOnce(); expect(card.querySelector(".box")!.textContent).toBe(link);
  });
  it("«Sin gestión» + «Otro» in material mode shows the aclaración and prepares once it is typed (review item 2A)", async () => {
    const general = { defaultPurpose: "first_contact" as const, purposes: [{ value: "first_contact" as const, label: "Presentación / primer contacto", templates: [] }, { value: "other" as const, label: "Otro", templates: [] }], contacts: [], businessPhone: "+54 9 3442 45-3797" };
    vi.mocked(fetchTemplates).mockResolvedValue(listing({ leads: [], general }));
    await open({}, "material"); await pick();
    const purpose = [...card.querySelectorAll("select")].find(select => [...select.options].some(option => option.value === "other"))!;
    purpose.value = "other"; purpose.dispatchEvent(new Event("change")); await flush();
    const input = [...card.querySelectorAll<HTMLLabelElement>("label")].find(label => label.textContent?.startsWith("Aclaración del propósito"))!.querySelector("input")!;
    expect(input.disabled).toBe(false); expect(prepareTemplate).toHaveBeenCalledTimes(1);
    input.value = "Pedir fotos"; input.dispatchEvent(new Event("change")); await flush(); await flush(); await flush();
    expect(prepareTemplate).toHaveBeenLastCalledWith("https://crm.example", "hcu_test", expect.objectContaining({ leadId: null, purpose: "other", otherPurpose: "Pedir fotos", templateId: null }));
  });
  it("shows the CRM's block reason and no picker for a blocked business", async () => {
    vi.mocked(fetchTemplates).mockResolvedValue(listing({ blocked: "El negocio tiene No contactar activo." }));
    await open({}, "material");
    expect(card.textContent).toContain("No contactar activo"); expect(card.textContent).not.toContain("ELEGÍ EL MATERIAL"); expect(fetchMaterials).not.toHaveBeenCalled();
  });
});

describe("«Sin gestión» in the WhatsApp panel (spec 98 decision 4)", () => {
  const general = { defaultPurpose: "first_contact" as const, purposes: [{ value: "first_contact" as const, label: "Presentación / primer contacto", templates: [{ id: "g1", name: "Presentación", recommended: true, body: "Hola" }] }, { value: "other" as const, label: "Otro", templates: [] }], contacts: [], businessPhone: "+54 9 3442 45-3797" };
  it("without managements prepares the general contact with the default purpose and the business phone", async () => {
    vi.mocked(fetchTemplates).mockResolvedValue(listing({ leads: [], general }));
    await open();
    expect(prepareTemplate).toHaveBeenCalledWith("https://crm.example", "hcu_test", expect.objectContaining({ accountId: "7", leadId: null, contactId: null, templateId: "g1", purpose: "first_contact", otherPurpose: null }));
    expect(card.textContent).toContain("Propósito"); expect(card.textContent).toContain("Teléfono del negocio");
  });
  it("with managements offers «Sin gestión» in the scope select, and «Otro» waits for its aclaración", async () => {
    vi.mocked(fetchTemplates).mockResolvedValue(listing({ general }));
    await open();
    expect(prepareTemplate).toHaveBeenCalledWith("https://crm.example", "hcu_test", expect.objectContaining({ leadId: "10" }));
    const scope = [...card.querySelectorAll("select")].find(select => [...select.options].some(option => option.text === "Sin gestión"))!;
    scope.value = ""; scope.dispatchEvent(new Event("change")); await flush(); await flush();
    expect(prepareTemplate).toHaveBeenLastCalledWith("https://crm.example", "hcu_test", expect.objectContaining({ leadId: null, purpose: "first_contact" }));
    const purpose = [...card.querySelectorAll("select")].find(select => [...select.options].some(option => option.value === "other"))!;
    purpose.value = "other"; purpose.dispatchEvent(new Event("change")); await flush();
    expect(card.textContent).toContain("Aclaración del propósito"); expect(prepareTemplate).toHaveBeenCalledTimes(2);
  });
  it("when people have a phone, one is chosen (never the business phone)", async () => {
    vi.mocked(fetchTemplates).mockResolvedValue(listing({ leads: [], general: { ...general, businessPhone: null, contacts: [{ id: "5", name: "Marcela", phone: "+54 9 3442 45-3797", default: true }] } }));
    await open();
    expect(prepareTemplate).toHaveBeenCalledWith("https://crm.example", "hcu_test", expect.objectContaining({ leadId: null, contactId: "5" }));
    expect(card.textContent).not.toContain("Teléfono del negocio");
  });
});
