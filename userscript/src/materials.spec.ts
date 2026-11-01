import { MATERIAL_ADD_FAILED, MATERIAL_REMOVE_FAILED, MATERIAL_SEARCH_DEBOUNCE_MS, addMissingMaterials, applyMaterialChange, emptyMaterialListing, heldMaterialsList, materialPicker, materialsInDraft, missingMaterials, removeHeldMaterial } from "./materials";

const folleto = { id: "1", title: "Folleto Alojamiento", categories: ["Folletos"], format: "pdf", formatLabel: "PDF" };
const video = { id: "2", title: "Video institucional", categories: ["Promoción"], format: "video", formatLabel: "Video" };
const other = { id: "3", title: "Material Gastronomía", categories: [], format: "pdf", formatLabel: "PDF", otherVertical: true };
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const options = (over: Partial<Parameters<typeof materialPicker>[0]> = {}): Parameters<typeof materialPicker>[0] => ({ listing: emptyMaterialListing(), refresh: true, busy: false, added: [], search: vi.fn().mockResolvedValue({ materials: [folleto, video], blocked: null }), onListing: vi.fn(), onAdd: vi.fn(), onClose: vi.fn(), ...over });
afterEach(() => { vi.useRealTimers(); });

describe("sales material in the panel (spec 89 §9)", () => {
  it("folds other verticals, counts them, and expands on demand while keeping applicable materials above", async () => {
    const picker = materialPicker(options({ refresh: false, listing: { search: "", materials: [folleto, other, video], truncated: false, error: "" } }));
    const fold = [...picker.querySelectorAll("button")].find(button => button.textContent === "De otras verticales (1)");
    expect(fold).toBeTruthy(); expect(picker.textContent).toContain("Folleto Alojamiento"); expect(picker.textContent).not.toContain("Material Gastronomía");
    fold!.click(); expect(picker.textContent).toContain("Material Gastronomía");
  });
  it("shows every material expanded when none applies to the business vertical", () => {
    const picker = materialPicker(options({ refresh: false, listing: { search: "", materials: [other], truncated: false, error: "" } }));
    expect(picker.textContent).toContain("Material Gastronomía"); expect(picker.textContent).not.toContain("De otras verticales");
  });
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

describe("the picker on Instagram and in «Enviar material» (spec 98 §6)", () => {
  it("ignores synthetic add, search and close events when a trusted guard is given", async () => {
    vi.useFakeTimers();
    const opts = options({ trusted: event => event.isTrusted }), picker = materialPicker(opts);
    await vi.advanceTimersByTimeAsync(0);
    [...picker.querySelectorAll("button")].find(b => b.textContent === "Agregar")!.click();
    const input = picker.querySelector("input")!; input.value = "video"; input.dispatchEvent(new Event("input"));
    await vi.advanceTimersByTimeAsync(MATERIAL_SEARCH_DEBOUNCE_MS);
    [...picker.querySelectorAll("button")].find(b => b.textContent === "Cerrar")!.click();
    expect(opts.onAdd).not.toHaveBeenCalled(); expect(opts.search).toHaveBeenCalledTimes(1); expect(opts.onClose).not.toHaveBeenCalled();
  });
  it("builds its nodes with the given document and shows the heading and close label of «Enviar material»", async () => {
    const other = document.implementation.createHTMLDocument("instagram"), spy = vi.spyOn(other, "createElement");
    const picker = materialPicker(options({ doc: other, heading: "ELEGÍ EL MATERIAL", closeLabel: "Volver al negocio" }));
    await flush();
    expect(spy).toHaveBeenCalled(); expect(picker.ownerDocument).toBe(other);
    expect(picker.querySelector("h3")!.textContent).toBe("ELEGÍ EL MATERIAL"); expect([...picker.querySelectorAll("button")].some(b => b.textContent === "Volver al negocio")).toBe(true);
  });
});

describe("materials follow a new draft (D2)", () => {
  const draft = { messageId: "m-2", revision: 1, body: "Hola", recipient: "+549", recipientName: "Ana", unresolved: [] };
  const added = [{ id: "1", title: "Folleto" }, { id: "2", title: "Video" }];
  it("knows what a reused draft already holds and what is missing", () => {
    expect(materialsInDraft({ ...draft, materials: [{ materialId: "1", title: "Folleto" }] })).toEqual(["1"]); expect(materialsInDraft(draft)).toEqual([]);
    expect(missingMaterials({ added, inDraft: ["1"] })).toEqual([{ id: "2", title: "Video" }]);
  });
  it("re-adds only the missing materials, one after the other, with each new revision", async () => {
    const add = vi.fn(async ({ revision }: { revision: number }) => ({ revision: revision + 1, body: `Hola + ${revision}` }));
    const result = await addMissingMaterials({ prepared: draft, added, inDraft: ["1"], add });
    expect(add).toHaveBeenCalledExactlyOnceWith({ messageId: "m-2", revision: 1, materialId: "2" });
    expect(result).toEqual({ prepared: { ...draft, revision: 2, body: "Hola + 1" }, inDraft: ["1", "2"], error: "" });
  });
  it("stops at the first refusal, keeps what was added and returns the error (no auto-retry)", async () => {
    const add = vi.fn().mockResolvedValueOnce({ revision: 2, body: "con folleto" }).mockRejectedValueOnce(new Error("«Video» ya no está disponible."));
    const result = await addMissingMaterials({ prepared: draft, added, inDraft: [], add });
    expect(add).toHaveBeenCalledTimes(2); expect(result.inDraft).toEqual(["1"]); expect(result.prepared.body).toBe("con folleto"); expect(result.error).toBe("«Video» ya no está disponible.");
    const silent = await addMissingMaterials({ prepared: draft, added, inDraft: [], add: vi.fn().mockRejectedValue(new Error("")) });
    expect(silent.error).toBe(MATERIAL_ADD_FAILED);
  });
});

describe("revision conflicts and «Quitar» (review item 6, owner 29/10/2026)", () => {
  const draft = { messageId: "m-1", revision: 1, body: "Hola", recipient: "+549", recipientName: "Ana", unresolved: [], materials: [{ shareId: "s-1", materialId: "1", title: "Folleto" }] };
  const conflict = () => Object.assign(new Error("El borrador cambió."), { status: 409 });
  it("re-adds after one re-prepare on a revision conflict, skipping what the fresh draft holds", async () => {
    // Arrange
    const add = vi.fn().mockRejectedValueOnce(conflict()).mockResolvedValueOnce({ revision: 6, body: "Hola + video" });
    const refresh = vi.fn(async () => ({ ...draft, revision: 5 }));
    // Act
    const result = await addMissingMaterials({ prepared: { ...draft, materials: [] }, added: [{ id: "1", title: "Folleto" }, { id: "2", title: "Video" }], inDraft: [], add, refresh });
    // Assert
    expect(refresh).toHaveBeenCalledOnce(); expect(add).toHaveBeenLastCalledWith({ messageId: "m-1", revision: 5, materialId: "2" });
    expect(result.error).toBe(""); expect(result.inDraft).toEqual(["1", "2"]); expect(result.prepared.revision).toBe(6);
  });
  it("a second conflict, a conflict without refresh or another error is returned, never retried again", async () => {
    const twice = vi.fn().mockRejectedValue(conflict()), refresh = vi.fn(async () => ({ ...draft, materials: [] }));
    expect((await addMissingMaterials({ prepared: draft, added: [{ id: "2", title: "Video" }], inDraft: [], add: twice, refresh })).error).toBe("El borrador cambió.");
    expect(twice).toHaveBeenCalledTimes(2); expect(refresh).toHaveBeenCalledOnce();
    const noRefresh = vi.fn().mockRejectedValue(conflict());
    expect((await addMissingMaterials({ prepared: draft, added: [{ id: "2", title: "Video" }], inDraft: [], add: noRefresh })).error).toBe("El borrador cambió."); expect(noRefresh).toHaveBeenCalledOnce();
  });
  it("applies the CRM's answer, keeping the held list when an older CRM sends none", () => {
    expect(applyMaterialChange(draft, { revision: 2, body: "x", materials: [] })).toMatchObject({ revision: 2, body: "x", materials: [] });
    expect(applyMaterialChange(draft, { revision: 2, body: "x" }).materials).toEqual(draft.materials);
  });
  it("removes a held material by its share; a conflict re-prepares once and retries with the fresh revision", async () => {
    const remove = vi.fn().mockResolvedValueOnce({ revision: 2, body: "", materials: [] });
    expect(await removeHeldMaterial({ prepared: draft, materialId: "1", remove })).toEqual({ prepared: { ...draft, revision: 2, body: "", materials: [] }, error: "" });
    expect(remove).toHaveBeenCalledWith({ messageId: "m-1", revision: 1, shareId: "s-1" });
    const retried = vi.fn().mockRejectedValueOnce(conflict()).mockResolvedValueOnce({ revision: 8, body: "", materials: [] });
    const result = await removeHeldMaterial({ prepared: draft, materialId: "1", remove: retried, refresh: async () => ({ ...draft, revision: 7 }) });
    expect(retried).toHaveBeenLastCalledWith({ messageId: "m-1", revision: 7, shareId: "s-1" }); expect(result.error).toBe("");
    const gone = vi.fn().mockRejectedValueOnce(conflict());
    expect((await removeHeldMaterial({ prepared: draft, materialId: "1", remove: gone, refresh: async () => ({ ...draft, materials: [] }) })).error).toBe("");
  });
  it("returns any other refusal as the error, and refuses a material without a share", async () => {
    expect((await removeHeldMaterial({ prepared: draft, materialId: "1", remove: vi.fn().mockRejectedValue(new Error("")) })).error).toBe(MATERIAL_REMOVE_FAILED);
    expect((await removeHeldMaterial({ prepared: draft, materialId: "9", remove: vi.fn() })).error).toBe(MATERIAL_REMOVE_FAILED);
  });
  it("lists the held materials with «Quitar» (or «Reintentar» for the failed one); only trusted clicks remove", () => {
    const onRemove = vi.fn();
    const list = heldMaterialsList({ materials: [...draft.materials, { shareId: "s-2", materialId: "2", title: "Video" }], busy: false, failed: "2", onRemove, trusted: event => event.isTrusted });
    expect([...list.querySelectorAll("button")].map(b => b.textContent)).toEqual(["Quitar", "Reintentar"]);
    list.querySelector("button")!.click(); expect(onRemove).not.toHaveBeenCalled();
    const open = heldMaterialsList({ materials: draft.materials, busy: false, failed: null, onRemove });
    open.querySelector("button")!.click(); expect(onRemove).toHaveBeenCalledWith("1");
    expect(heldMaterialsList({ materials: draft.materials, busy: true, failed: null, onRemove }).querySelector("button")!.disabled).toBe(true);
  });
});
