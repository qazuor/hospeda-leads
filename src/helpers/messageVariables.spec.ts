import { describe, expect, it } from "vitest";
import { defaultMessageVariableSettings, resolveMessageVariables, validateMessageVariables, withDefaultMessageVariables, type MessageVariableDefinition } from "./messageVariables";

describe("message variables", () => {
  it("preserves the built-in CRM variables", () => {
    expect(resolveMessageVariables({ name: "La Posada", contact: "Ana", type: "Alojamientos" })).toMatchObject({
      name: "La Posada", contact: "Ana", type: "Alojamientos",
    });
  });

  it("chooses the most specific applicable text and resolves nested variables", () => {
    const definitions: MessageVariableDefinition[] = [
      { key: "saludo", label: "Saludo", description: "", source: { kind: "text", key: "" }, active: true, alternatives: [
        { id: "generic", text: "Hola", conditions: {} },
        { id: "hotel", text: "Buen día, {{contact}}", conditions: { vertical: "Alojamientos", businessType: "Hotel" } },
      ] },
      { key: "apertura", label: "Apertura", description: "", source: { kind: "text", key: "" }, active: true, alternatives: [
        { id: "nested", text: "{{saludo}}. Te escribo de Hospeda.", conditions: {} },
      ] },
    ];

    const values = resolveMessageVariables({ contact: "Ana", type: "Alojamientos", subtype: "Hotel" }, definitions);
    expect(values.apertura).toBe("Buen día, Ana. Te escribo de Hospeda.");
  });

  it("resolves date and greeting from Argentina local time", () => {
    const definitions: MessageVariableDefinition[] = [
      { key: "saludo", label: "Saludo", description: "", source: { kind: "system", key: "greeting" }, active: true, alternatives: [] },
      { key: "dia", label: "Día", description: "", source: { kind: "system", key: "weekday" }, active: true, alternatives: [] },
    ];
    const values = resolveMessageVariables({}, definitions, new Date("2026-10-19T15:00:00.000Z"));
    expect(values.saludo).toBe("Buenas tardes");
    expect(values.dia).toBe("lunes");
  });

  it("ships generic greeting, thanks, sign-off and presentation defaults", () => {
    const defaults = defaultMessageVariableSettings();
    expect(resolveMessageVariables({ sender: "Ana", channel: "whatsapp" }, defaults, new Date("2026-10-19T11:00:00.000Z"))).toMatchObject({
      saludo: "Buen día", gracias: "¡Gracias por leerme!", despedida: "¡Que tengas un buen día!",
      presentacion: "Soy Ana, de Hospeda.", firma: "Ana\nEquipo Hospeda",
      pregunta_cierre: "¿Querés que te cuente un poco más por acá?",
    });
  });

  it("adds new defaults to a previously saved catalog but preserves disabled entries", () => {
    const oldCatalog = defaultMessageVariableSettings().slice(0, 5);
    oldCatalog.push({ ...defaultMessageVariableSettings()[5], active: false });
    const merged = withDefaultMessageVariables(oldCatalog);
    expect(merged.find(variable => variable.key === "saludo")?.active).toBe(false);
    expect(merged.some(variable => variable.key === "gracias" && variable.active)).toBe(true);
  });

  it("rejects invalid or duplicate variable identifiers and unsafe CRM fields", () => {
    const defaults = defaultMessageVariableSettings();
    expect(() => validateMessageVariables([...defaults, { ...defaults[0] }])).toThrow(/único/);
    expect(() => validateMessageVariables([{ ...defaults[0], key: "dato", source: { kind: "crm", key: "password" } }])).toThrow(/no está permitido/);
  });
});
