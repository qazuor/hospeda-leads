import { MATERIAL_SEARCH_DEBOUNCE_MS, emptyMaterialListing, materialPicker } from "./materials";

const folleto = { id: "1", title: "Folleto Alojamiento", categories: ["Folletos"], format: "pdf", formatLabel: "PDF" };
const video = { id: "2", title: "Video institucional", categories: ["Promoción"], format: "video", formatLabel: "Video" };
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const options = (over: Partial<Parameters<typeof materialPicker>[0]> = {}): Parameters<typeof materialPicker>[0] => ({ listing: emptyMaterialListing(), refresh: true, busy: false, added: [], search: vi.fn().mockResolvedValue({ materials: [folleto, video], blocked: null }), onListing: vi.fn(), onAdd: vi.fn(), onClose: vi.fn(), ...over });
afterEach(() => { vi.useRealTimers(); });

describe("sales material in the panel (spec 89 §9)", () => {
  it("asks the CRM on opening and marks what is already in the text", async () => {
    const opts = options({ added: ["1"] }), picker = materialPicker(opts);
    expect(picker.textContent).toContain("Cargando material…");
    await flush();
    expect(opts.search).toHaveBeenCalledWith("");
    expect(opts.onListing).toHaveBeenCalledWith({ search: "", materials: [folleto, video], truncated: false, error: "" });
    const buttons = [...picker.querySelectorAll("button")];
    expect(buttons.find(b => b.textContent === "Agregado")!.disabled).toBe(true);
    buttons.find(b => b.textContent === "Agregar")!.click();
    expect(opts.onAdd).toHaveBeenCalledWith(video);
  });
  it("searches on the server after a pause, keeps the box and ignores stale answers (the list is capped, regression)", async () => {
    vi.useFakeTimers();
    let resolveFirst: (v: unknown) => void = () => {};
    const search = vi.fn().mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; })).mockResolvedValueOnce({ materials: [video], blocked: null, truncated: false });
    const picker = materialPicker(options({ refresh: false, listing: { search: "", materials: [folleto], truncated: true, error: "" }, search }));
    expect(search).not.toHaveBeenCalled(); expect(picker.textContent).toContain("Hay más material del que se muestra");
    const input = picker.querySelector("input")!;
    input.value = "fol"; input.dispatchEvent(new Event("input"));
    await vi.advanceTimersByTimeAsync(MATERIAL_SEARCH_DEBOUNCE_MS);
    expect(search).toHaveBeenLastCalledWith("fol"); expect(picker.textContent).toContain("Buscando…");
    input.value = "video"; input.dispatchEvent(new Event("input"));
    await vi.advanceTimersByTimeAsync(MATERIAL_SEARCH_DEBOUNCE_MS);
    expect(search).toHaveBeenCalledTimes(2); expect(search).toHaveBeenLastCalledWith("video");
    resolveFirst({ materials: [folleto], blocked: null }); await vi.advanceTimersByTimeAsync(0);
    expect(picker.textContent).toContain("Video institucional"); expect(picker.textContent).not.toContain("Folleto Alojamiento");
    expect(picker.querySelector("input")).toBe(input);
  });
  it("shows the reason of a blocked business instead of a list", async () => {
    const picker = materialPicker(options({ search: vi.fn().mockResolvedValue({ materials: [], blocked: "El negocio tiene No contactar activo." }) }));
    await flush();
    expect(picker.textContent).toContain("El negocio tiene No contactar activo."); expect(picker.textContent).not.toContain("No hay material entregable");
  });
  it("says when there is no deliverable material", async () => {
    const picker = materialPicker(options({ search: vi.fn().mockResolvedValue({ materials: [], blocked: null }) }));
    await flush();
    expect(picker.textContent).toContain("No hay material entregable");
  });
});
