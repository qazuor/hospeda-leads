import { fetchAutoRegistrations, voidAutoRegistration, type AutoRegistration, type Match } from "./api";
import type { UiOptions } from "./ui";

const TOKEN_KEY = "hospeda-userscript-token";
const REASONS = ["Era de otro negocio", "No era de esta gestión", "Mensaje personal", "Otro"] as const;
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] { const node = document.createElement(tag); if (cls) node.className = cls; if (text) node.textContent = text; return node; }
function button(text: string, cls: string, action: () => void, disabled = false): HTMLButtonElement { const node = el("button", cls, text); node.type = "button"; node.disabled = disabled; node.addEventListener("click", action); return node; }
const fail = (error: unknown) => error instanceof Error ? error.message : "No se pudo completar la operación.";

/** The automatic registrations for one business; inline voiding keeps the seller in the same chat. */
export function openAutoList(card: HTMLElement, options: UiOptions, match: Match, back: () => void, header: (title: string) => HTMLElement): void {
  let rows: AutoRegistration[] = [], loading = true, loadError = "", expanded = "", reason = "", custom = "", busy = false, notice = "", warn = false;
  const base = options.crmBase || "", token = GM_getValue<string>(TOKEN_KEY, "");
  const render = () => {
    const body = el("div", "body"), list = el("div", "list");
    if (loading) body.append(el("p", "muted", "Cargando registros…"));
    else if (loadError) body.append(el("p", "note warn", loadError), button("Reintentar", "btn", () => void load()));
    else if (!rows.length) body.append(el("p", "muted", "No hay registros automáticos en los últimos 7 días."));
    else for (const item of rows) {
      const row = el("div", "row"), content = el("span", "content"), meta = el("span", "meta");
      meta.append(el("span", `dir ${item.direction}`, item.direction === "out" ? "Enviado" : "Recibido"), el("span", undefined, time(item)));
      content.append(meta, el("span", "text", item.excerpt.slice(0, 280)));
      if (expanded === item.id) {
        const form = el("div", "section"), field = el("fieldset", "section"); field.style.border = "0"; field.style.padding = "0"; field.style.margin = "0";
        for (const option of REASONS) { const label = el("label", "row"), input = el("input"); input.type = "radio"; input.name = `void-${item.id}`; input.value = option; input.checked = reason === option; input.disabled = busy; input.addEventListener("change", () => { reason = option; render(); }); label.append(input, el("span", "content", option)); field.append(label); }
        form.append(field);
        let submit:HTMLButtonElement|null=null;
        if (reason === "Otro") { const input = el("input", undefined); input.type = "text"; input.minLength = 3; input.maxLength = 500; input.required = true; input.placeholder = "Contá brevemente el motivo"; input.value = custom; input.disabled = busy; input.addEventListener("input", () => { custom = input.value; if(submit)submit.disabled=busy||custom.trim().length<3||custom.trim().length>500; }); form.append(input); }
        submit=button(busy ? "Anulando…" : "Anular registro", "btn danger", () => void undo(item), busy || !reason || (reason === "Otro" && (custom.trim().length < 3 || custom.trim().length > 500)));form.append(submit); content.append(form);
      } else content.append(button("Deshacer", "btn small", () => { expanded = item.id; reason = ""; custom = ""; notice = ""; render(); }));
      row.append(content); list.append(row);
    }
    body.append(list);
    if (notice) body.append(el("p", `note ${warn ? "warn" : "info"}`, notice));
    card.replaceChildren(header("Registrados solos"), body);
  };
  function time(item: AutoRegistration): string { const value = item.sentAt || item.receivedAt; return value ? new Date(value).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : "Sin hora"; }
  async function load(): Promise<void> { loading = true; loadError = ""; render(); try { rows = (await fetchAutoRegistrations(base, token, match.accountId)).registrations; } catch (error) { loadError = fail(error); } finally { loading = false; render(); } }
  async function undo(item: AutoRegistration): Promise<void> { if (busy || !reason || (reason === "Otro" && custom.trim().length < 3)) return; busy = true; notice = ""; render(); try { const result = await voidAutoRegistration(base, token, { id: item.id, reason: reason === "Otro" ? custom.trim() : reason }); rows = rows.filter(row => row.id !== item.id); expanded = ""; reason = ""; custom = ""; warn = result.skipped.length > 0; notice = result.skipped.length ? result.skipped.join(" ") : "Registro anulado."; } catch (error) { warn = true; notice = fail(error); } finally { busy = false; render(); } }
  void load(); render();
}
