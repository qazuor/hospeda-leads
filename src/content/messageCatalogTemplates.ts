import type { ContactPurpose } from "../helpers/contactPurpose";
import type { ManagementType } from "../helpers/businessManagement";

/**
 * Message template catalog approved in October 2026 (rebuilt from scratch).
 * Template copy stays register-neutral; everything that depends on "vos"/"ustedes", the hour, the city or the rubro
 * lives in variables (src/content/messageCatalogVariables.ts), so two businesses rarely receive the same text.
 * Migration 036 is generated from this file by scripts/build-message-catalog-migration.ts.
 */

export type CatalogChannel = "email" | "whatsapp" | "social";
export type CatalogTemplate = {
  name: string;
  channel: CatalogChannel;
  purpose: ContactPurpose;
  managementType: ManagementType | null;
  subject: string | null;
  body: string;
};

type Base = {
  label: string;
  purpose: ContactPurpose;
  managementType: ManagementType | null;
  subject: string;
  /** Paragraphs shared by every channel. */
  paragraphs: string[];
  /** Closing paragraph for chat channels (WhatsApp and Instagram); email always closes with the farewell and signature. */
  chatClosing?: string;
};

const CHANNEL_LABELS: Record<CatalogChannel, string> = { email: "Email", whatsapp: "WhatsApp", social: "Instagram" };
const SIGNATURE = "{{sender}}<br>{{sender_email}} · {{telefono_hospeda}}<br>Equipo Hospeda";
const OPENING = "{{saludo}} {{presentacion}}";
const CITY = "{{#if city}}, {{ref_ciudad}}{{/if}}";

const BASES: Base[] = [
  {
    label: "Verificación del negocio", purpose: "verification", managementType: null, subject: "Consulta sobre {{name}}",
    paragraphs: [OPENING, "Quería confirmar un dato: ¿este es el contacto de {{name}}{{#if city}} en {{city}}{{/if}}?", "Estamos actualizando la información de los negocios turísticos de la zona y queremos asegurarnos de que los datos estén al día."],
    chatClosing: "{{despedida}}",
  },
  {
    label: "Primer contacto · Verticales principales", purpose: "first_contact", managementType: "main", subject: "Invitación a sumar {{name}} a Hospeda",
    paragraphs: [OPENING, `Me comunico por {{name}}${CITY}. {{etapa_hospeda}}`, "{{propuesta_valor}} {{prueba_gratis}} {{ayuda_ficha}}", "{{#if temporada}}{{temporada}} {{/if}}Toda la información está acá: {{link_presentacion}}", "{{pregunta_presentacion}}"],
  },
  {
    label: "Primer contacto · Aliados", purpose: "first_contact", managementType: "partner", subject: "Programa de aliados de Hospeda",
    paragraphs: [OPENING, `Me comunico por {{name}}${CITY}. {{propuesta_aliados}}`, "El nivel y los valores se definen en una charla, según cada caso. Más información: {{link_aliados}}", "{{pregunta_presentacion}}"],
  },
  {
    label: "Primer contacto · Proveedores", purpose: "first_contact", managementType: "provider", subject: "Directorio de proveedores de Hospeda",
    paragraphs: [OPENING, `Me comunico por {{name}}${CITY}. {{propuesta_proveedores}}`, "Así funciona: {{link_proveedores}}", "{{pregunta_presentacion}}"],
  },
  {
    label: "Primer contacto · Editores", purpose: "first_contact", managementType: "editor", subject: "Colaboración editorial con Hospeda",
    paragraphs: [OPENING, "{{propuesta_editores}}", "Más detalles: {{link_editores}}", "{{pregunta_presentacion}}"],
  },
  {
    label: "Retomar conversación", purpose: "resume", managementType: null, subject: "Retomando lo de {{name}} y Hospeda",
    paragraphs: [OPENING, "Retomo lo que hablamos sobre {{name}} y Hospeda.", "{{#if temporada}}{{temporada}} {{/if}}Dejo de nuevo la información: {{link_presentacion}}", "{{pregunta_retomar}}"],
  },
  {
    label: "Relación y novedades", purpose: "relationship", managementType: null, subject: "Novedades de Hospeda",
    paragraphs: [OPENING, "Comparto novedades de Hospeda: seguimos sumando alojamientos, gastronomía y experiencias de la región para que quien viaja encuentre todo en un solo lugar.", "Lo nuevo se publica en Instagram ({{link_instagram}}) y en {{link_hospeda}}."],
    chatClosing: "{{despedida}}",
  },
  {
    label: "Acompañamiento · Bienvenida", purpose: "care", managementType: "accompaniment", subject: "Bienvenida a Hospeda · {{name}}",
    paragraphs: [OPENING, "Gracias por sumar {{name}} a Hospeda. Para armar la ficha necesitamos fotos, una descripción breve, horarios y datos de contacto.", "El paso a paso es simple: se crea la cuenta, armamos la ficha con ese material y al publicarla empiezan los 30 días de prueba. Antes de que terminen, ayudamos a elegir el plan.", "Cualquier consulta, estamos en el {{telefono_hospeda}}."],
    chatClosing: "{{despedida}}",
  },
  {
    label: "Acompañamiento · Fin de la prueba", purpose: "care", managementType: "accompaniment", subject: "La prueba de {{name}} en Hospeda está por terminar",
    paragraphs: [OPENING, "La prueba de 30 días de {{name}} en Hospeda está por terminar.", "Para que la ficha siga visible hay que elegir un plan desde la cuenta. Si no se elige, la ficha deja de verse pero no se borra: vuelve a publicarse al elegir un plan.", "Si hace falta, ayudamos a elegir el plan que mejor se ajuste. Planes y detalles: {{link_presentacion}}"],
    chatClosing: "{{despedida}}",
  },
  {
    label: "Coordinación · Pedido de material", purpose: "operations", managementType: null, subject: "Material para la ficha de {{name}}",
    paragraphs: [OPENING, "Para avanzar con la ficha de {{name}} en Hospeda necesitamos este material:", "• Fotos (la principal y algunas más)<br>• Una descripción breve<br>• Horarios y datos de contacto<br>• Redes o sitio web, si los hay", "Se puede enviar por este medio o al {{telefono_hospeda}}."],
    chatClosing: "{{despedida}}",
  },
  {
    label: "Coordinación · Revisión de la ficha", purpose: "operations", managementType: null, subject: "Revisión de la ficha de {{name}}",
    paragraphs: [OPENING, "La ficha de {{name}} ya está armada{{#if hospeda_url}}: {{hospeda_url}}{{/if}}.", "Antes de publicarla conviene revisar que los datos y las fotos estén bien. Cualquier cambio, lo corregimos enseguida."],
    chatClosing: "{{despedida}}",
  },
];

const html = (paragraphs: string[]) => paragraphs.map(paragraph => `<p>${paragraph}</p>`).join("");

/** Every base in Email, WhatsApp and Instagram, in a stable order (the migration and its drift test depend on it). */
export const MESSAGE_CATALOG_TEMPLATES: CatalogTemplate[] = BASES.flatMap(base => (["email", "whatsapp", "social"] as const).map(channel => ({
  name: `${base.label} · ${CHANNEL_LABELS[channel]}`,
  channel,
  purpose: base.purpose,
  managementType: base.managementType,
  subject: channel === "email" ? base.subject : null,
  body: channel === "email"
    ? html([...base.paragraphs, "{{despedida}}", SIGNATURE])
    : html([...base.paragraphs, ...(base.chatClosing ? [base.chatClosing] : [])]),
})));
