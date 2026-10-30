import { strictComparisonName } from "./dataNormalization";
import { canonicalVertical } from "./verticalColors";
import { MESSAGE_CATALOG_VARIABLES } from "../content/messageCatalogVariables";

export type MessageVariableCondition = {
  verticals?: string[];
  businessType?: string | null;
  managementType?: string | null;
  dayPeriod?: "morning" | "afternoon" | "evening" | null;
  channel?: "email" | "whatsapp" | "social" | "other" | null;
  contactName?: "present" | "missing" | null;
  cities?: string[];
  commercialProfiles?: ("Independiente" | "Consolidado" | "Referente" | "none")[];
  purpose?: import("./contactPurpose").ContactPurpose | null;
  weekdays?: number[];
  months?: number[];
  isClient?: boolean | null;
};

export type MessageVariableAlternative = {
  id: string;
  text: string;
  conditions: MessageVariableCondition;
};

export type MessageVariableDefinition = {
  key: string;
  label: string;
  description: string;
  source: { kind: "text" | "crm" | "system" | "variable"; key: string };
  alternatives: MessageVariableAlternative[];
  active: boolean;
};

/** Built-in variables: the catalog approved in October 2026 (src/content/messageCatalogVariables.ts). */
export const DEFAULT_MESSAGE_VARIABLES: MessageVariableDefinition[] = MESSAGE_CATALOG_VARIABLES;

export const MESSAGE_VARIABLE_CRM_SOURCES = [
  ["name", "Nombre del negocio"], ["city", "Localidad"], ["type", "Vertical"],
  ["subtype", "Tipo de negocio"], ["contact", "Nombre del contacto"], ["contact_first", "Nombre de pila del contacto"], ["email", "Email elegido"],
  ["phone", "Teléfono elegido"], ["website", "Sitio web"], ["sender", "Responsable asignado"],
  ["sender_short", "Nombre corto del responsable"], ["sender_email", "Email del responsable"], ["hospeda_url", "Enlace a la ficha pública"],
] as const;

export const MESSAGE_VARIABLE_SYSTEM_SOURCES = [
  ["greeting", "Saludo según la hora"], ["hour", "Hora local"], ["weekday", "Día de la semana"],
  ["month", "Mes actual"], ["date", "Fecha local"],
] as const;

export function defaultMessageVariableSettings(): MessageVariableDefinition[] {
  return DEFAULT_MESSAGE_VARIABLES.map(variable => ({
    ...variable,
    source: { ...variable.source },
    alternatives: variable.alternatives.map(alternative => ({ ...alternative, conditions: { ...alternative.conditions } })),
  }));
}

export function withDefaultMessageVariables(stored: unknown): MessageVariableDefinition[] {
  return stored == null ? defaultMessageVariableSettings() : validateMessageVariables(stored);
}

export function validateMessageVariables(value: unknown): MessageVariableDefinition[] {
  if (!Array.isArray(value) || value.length > 200) throw new Error("La configuración de variables no es válida.");
  const keys = new Set<string>();
  let totalCharacters = 0;
  return value.map((raw: any) => {
    const key = String(raw?.key ?? "");
    if (!/^[a-z][a-z0-9_]{1,39}$/.test(key) || keys.has(key)) throw new Error("Cada variable necesita un nombre único en minúsculas, sin espacios.");
    keys.add(key);
    const label = String(raw?.label ?? "").trim();
    if (!label || label.length > 100) throw new Error(`Completá un nombre breve para {{${key}}}.`);
    totalCharacters += label.length + String(raw?.description ?? "").length;
    const sourceKind = raw?.source?.kind;
    const sourceKey = String(raw?.source?.key ?? "");
    if (!["text", "crm", "system", "variable"].includes(sourceKind)) throw new Error(`La fuente de {{${key}}} no es válida.`);
    if (sourceKind === "crm" && !MESSAGE_VARIABLE_CRM_SOURCES.some(([field]) => field === sourceKey) && !["business_status","is_client"].includes(sourceKey)) throw new Error(`El campo CRM de {{${key}}} no está permitido.`);
    if (sourceKind === "system" && !MESSAGE_VARIABLE_SYSTEM_SOURCES.some(([field]) => field === sourceKey)) throw new Error(`El dato del sistema de {{${key}}} no está permitido.`);
    if (sourceKind === "variable" && (!/^[a-z][a-z0-9_]{1,39}$/.test(sourceKey) || sourceKey === key)) throw new Error(`La referencia anidada de {{${key}}} no es válida.`);
    if (sourceKind === "text" && sourceKey !== "") throw new Error(`La fuente de texto de {{${key}}} debe quedar vacía.`);
    if (!Array.isArray(raw?.alternatives) || raw.alternatives.length > 100) throw new Error(`Las alternativas de {{${key}}} no son válidas.`);
    const alternatives = raw.alternatives.map((item: any, index: number) => {
      const text = String(item?.text ?? "");
      if (!text.trim() || text.length > 4000) throw new Error(`La alternativa ${index + 1} de {{${key}}} necesita texto (máximo 4000 caracteres).`);
      totalCharacters += text.length;
      if (totalCharacters > 100_000) throw new Error("La configuración completa no puede superar los 100.000 caracteres.");
      const c = item?.conditions ?? {};
      const dayPeriod = c.dayPeriod || null;
      if (dayPeriod && !["morning", "afternoon", "evening"].includes(dayPeriod)) throw new Error(`La condición horaria de {{${key}}} no es válida.`);
      const channel = c.channel || null;
      if (channel && !["email", "whatsapp", "social", "other"].includes(channel)) throw new Error(`La condición de canal de {{${key}}} no es válida.`);
      const contactName = c.contactName || null;
      if (contactName && !["present", "missing"].includes(contactName)) throw new Error(`La condición de contacto de {{${key}}} no es válida.`);
      const profileValues=Array.isArray(c.commercialProfiles)?c.commercialProfiles:c.commercialProfile?[c.commercialProfile]:[];
      if(profileValues.some((profile:unknown)=>!['Independiente','Consolidado','Referente','none'].includes(String(profile))))throw new Error(`La condición de perfil comercial de {{${key}}} no es válida.`);
      const commercialProfiles=[...new Set(profileValues.map(String))] as NonNullable<MessageVariableCondition['commercialProfiles']>;
      const purpose=c.purpose||null;
      if(purpose&&!['verification','first_contact','resume','relationship','care','operations','other'].includes(purpose))throw new Error(`La condición de propósito de {{${key}}} no es válida.`);
      const cities=Array.isArray(c.cities)?c.cities.map((city:unknown)=>String(city).trim()).filter(Boolean):[];
      const weekdays=Array.isArray(c.weekdays)?c.weekdays.map(Number):[];
      const months=Array.isArray(c.months)?c.months.map(Number):[];
      if(weekdays.some((day:number)=>!Number.isInteger(day)||day<0||day>6))throw new Error(`Los días de {{${key}}} deben estar entre 0 y 6.`);
      if(months.some((month:number)=>!Number.isInteger(month)||month<1||month>12))throw new Error(`Los meses de {{${key}}} deben estar entre 1 y 12.`);
      const verticalValues=Array.isArray(c.verticals)?c.verticals:c.vertical?[c.vertical]:[];
      const verticals=[...new Set(verticalValues.map((vertical:unknown)=>String(vertical).trim().slice(0,100)).filter(Boolean))];
      const conditions = {
        verticals,
        businessType: c.businessType ? String(c.businessType).slice(0, 100) : null,
        managementType: c.managementType ? String(c.managementType).slice(0, 40) : null,
        dayPeriod,
        channel,
        contactName,
        cities,commercialProfiles,purpose,weekdays,months,isClient:typeof c.isClient==='boolean'?c.isClient:null,
      };
      return { id: String(item?.id || `${key}-${index + 1}`).slice(0, 80), text, conditions };
    });
    return { key, label, description: String(raw?.description ?? "").slice(0, 500), source: { kind: sourceKind, key: sourceKind === "text" ? "" : sourceKey }, alternatives, active: raw?.active !== false } as MessageVariableDefinition;
  });
}

export function systemTemplateContext(now = new Date()) {
  const parts = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "numeric", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const hour = Number(parts.find(part => part.type === "hour")?.value ?? 0);
  const dayPeriod = hour < 12 ? "morning" : hour < 19 ? "afternoon" : "evening";
  const local = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
  return {
    __dayPeriod: dayPeriod,
    __system: {
      greeting: dayPeriod === "morning" ? "Buen día" : dayPeriod === "afternoon" ? "Buenas tardes" : "Buenas noches",
      hour: `${String(hour).padStart(2, "0")}:${parts.find(part => part.type === "minute")?.value ?? "00"}`,
      weekday: new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", weekday: "long" }).format(now),
      weekdayIndex: Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Argentina/Buenos_Aires", weekday: "short" }).format(now).replace(/Sun|Mon|Tue|Wed|Thu|Fri|Sat/, match => String(['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(match)))),
      month: new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", month: "long" }).format(now),
      monthIndex: Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Argentina/Buenos_Aires", month: "numeric" }).format(now)),
      date: local.format(now),
    },
  };
}

export function resolveMessageVariables(context: Record<string, unknown>, definitions: MessageVariableDefinition[] = defaultMessageVariableSettings(), now = new Date()) {
  const values: Record<string, string> = Object.fromEntries(Object.entries(context).map(([key, value]) => [key, value == null ? "" : String(value).trim()]));
  const system = systemTemplateContext(now);
  const fullContext = { ...context, ...system } as Record<string, any>;
  const active = definitions.filter(item => item.active);
  const byKey = new Map(active.map(item => [item.key, item]));
  const resolved = new Set<string>();
  const resolve = (key: string, depth = 0): string => {
    if (!byKey.has(key)) return values[key] ?? "";
    if (resolved.has(key) || depth > 10) return "";
    const variable = byKey.get(key);
    if (!variable) return "";
    resolved.add(key);
    const matches = variable.alternatives.flatMap((alternative, index) => {
      const c = alternative.conditions;
      if (c.verticals?.length && !c.verticals.some(vertical=>canonicalVertical(vertical)===canonicalVertical(String(fullContext.type??"")))) return [];
      if (c.businessType && c.businessType !== String(fullContext.subtype ?? "")) return [];
      if (c.managementType && c.managementType !== String(fullContext.managementType ?? "")) return [];
      if (c.dayPeriod && c.dayPeriod !== system.__dayPeriod) return [];
      if (c.channel && c.channel !== String(fullContext.channel ?? "")) return [];
      if (c.contactName === "present" && !String(fullContext.contact ?? "").trim()) return [];
      if (c.contactName === "missing" && String(fullContext.contact ?? "").trim()) return [];
      if(c.cities?.length&&!c.cities.some(city=>normalizeCity(city)===normalizeCity(String(fullContext.city??''))))return [];
      if(c.commercialProfiles?.length&&!c.commercialProfiles.some(profile=>profile==='none'?!String(fullContext.commercialProfile??'').trim():profile===fullContext.commercialProfile))return [];
      if(c.purpose&&c.purpose!==fullContext.purpose)return [];
      if(c.weekdays?.length&&!c.weekdays.includes(Number(system.__system.weekdayIndex)))return [];
      if(c.months?.length&&!c.months.includes(Number(system.__system.monthIndex)))return [];
      if(typeof c.isClient==='boolean'&&c.isClient!==Boolean(fullContext.isClient))return [];
      const specificity = Number(!!c.verticals?.length) + Number(!!c.businessType) + Number(!!c.managementType) + Number(!!c.dayPeriod) + Number(!!c.channel) + Number(!!c.contactName)+Number(!!c.cities?.length)+Number(!!c.commercialProfiles?.length)+Number(!!c.purpose)+Number(!!c.weekdays?.length)+Number(!!c.months?.length)+Number(typeof c.isClient==='boolean');
      return [{ alternative, specificity, index }];
    });
    const max=matches.length?Math.max(...matches.map(item=>item.specificity)):-1;
    const group=matches.filter(item=>item.specificity===max);
    const previous=(fullContext.__previousPicks as Record<string,string>|undefined)?.[key];
    const eligible=group.length>1&&previous?group.filter(item=>item.alternative.id!==previous):group;
    const chosen=eligible.length?eligible[hashSeed(String(fullContext.__seed??'message-preview')+'\0'+key)%eligible.length]:undefined;
    let output = "";
    if (chosen) { output = chosen.alternative.text.replace(/{{([a-zA-Z0-9_]+)}}/g, (_, nestedKey) => resolve(nestedKey, depth + 1)); const picks=fullContext.__chosenPicks as Record<string,string>|undefined;if(picks)picks[key]=chosen.alternative.id; }
    else if (variable.source.kind === "crm") output = values[variable.source.key] ?? "";
    else if (variable.source.kind === "system") output = String((system.__system as any)[variable.source.key] ?? "");
    else if (variable.source.kind === "variable") output = resolve(variable.source.key, depth + 1);
    resolved.delete(key);
    return output;
  };
  for (const variable of active) values[variable.key] = resolve(variable.key);
  return values;
}

const normalizeCity=(value:string)=>strictComparisonName(value);
const hashSeed=(value:string)=>{let hash=2166136261;for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619);}return hash>>>0;};
