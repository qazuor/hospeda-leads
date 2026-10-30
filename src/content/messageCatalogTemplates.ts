import type { ContactPurpose } from "../helpers/contactPurpose";
import type { ManagementType } from "../helpers/businessManagement";

/**
 * Message template catalog approved in October 2026 (rebuilt from scratch).
 * Email can explain more; WhatsApp and Instagram stay very short so they get read. Template copy stays register-neutral; everything that depends on "vos"/"ustedes", the hour, the city or the rubro
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
  /** Email blocks: can be longer and use bold, lists and links. The farewell is appended; the signature comes from the email layout. */
  email: string[];
  /** WhatsApp and Instagram blocks: very short, one idea per block. Instagram drops the bold on copy. */
  chat: string[];
};

const CHANNEL_LABELS: Record<CatalogChannel, string> = { email: "Email", whatsapp: "WhatsApp", social: "Instagram" };
const EMAIL_OPENING = ["{{saludo}}", "{{presentacion}}"];
const CHAT_OPENING = "{{saludo}} {{presentacion}}";
/** Follow-up messages: the business already knows what Hospeda is, so only the name. */
const EMAIL_FOLLOW_UP = ["{{saludo}}", "{{presentacion_breve}}"];
const CHAT_FOLLOW_UP = "{{saludo}} {{presentacion_breve}}";
const link = (key: string) => `<a href="{{${key}}}">{{${key}}}</a>`;
const MATERIAL = ["Fotos (la principal y algunas más)", "Una descripción breve", "Horarios y datos de contacto", "Redes o sitio web, si los hay"];
const list = (items: readonly string[]) => `<ul>${items.map(item => `<li>${item}</li>`).join("")}</ul>`;
const chatList = (items: readonly string[]) => items.map(item => `• ${item}`).join("<br>");

const BASES: Base[] = [
  {
    label: "Verificación del negocio", purpose: "verification", managementType: null, subject: "Consulta sobre {{name}}",
    email: [...EMAIL_OPENING, "Quería confirmar un dato: ¿este es el contacto de {{name}}{{#if city}} en {{city}}{{/if}}?", "Estamos actualizando la información de los negocios turísticos de la zona y queremos que los datos estén al día."],
    chat: [CHAT_OPENING, "¿Este es el contacto de {{name}}{{#if city}} en {{city}}{{/if}}?", "Estamos actualizando los datos de los negocios turísticos de la zona. ¡Gracias!"],
  },
  {
    label: "Primer contacto · Verticales principales", purpose: "first_contact", managementType: "main", subject: "Sumar {{name}} a Hospeda",
    email: [
      ...EMAIL_OPENING,
      "Me comunico por {{name}}.{{#if city}} Queremos que quien planea una visita encuentre en un solo lugar dónde dormir, dónde comer y qué hacer {{ref_ciudad}}.{{/if}}",
      "{{etapa_hospeda}}",
      "{{propuesta_valor}}",
      "<strong>Para probarlo:</strong> {{prueba_gratis}}",
      "<strong>Nos ocupamos de la carga:</strong> {{ayuda_ficha}}",
      "{{#if temporada}}{{temporada}}{{/if}}",
      `Toda la información está acá: ${link("link_presentacion")}`,
      "{{pregunta_presentacion}}",
    ],
    chat: [CHAT_OPENING, "Me comunico por {{name}}. {{etapa_corta}}", "{{propuesta_corta}}", "<strong>{{prueba_corta}}</strong>", "{{pregunta_presentacion}}"],
  },
  {
    label: "Primer contacto · Aliados", purpose: "first_contact", managementType: "partner", subject: "Programa de aliados de Hospeda",
    email: [
      ...EMAIL_OPENING,
      "Me comunico por {{name}}. {{propuesta_aliados}}",
      "El programa incluye:",
      list(["Logo en la portada de Hospeda", "Difusión en nuestras redes y en el newsletter", "Registro de cada aparición"]),
      "{{etapa_hospeda}}",
      `El nivel y los valores se definen en una charla, según cada caso. Más información: ${link("link_aliados")}`,
      "{{pregunta_presentacion}}",
    ],
    chat: [CHAT_OPENING, "Me comunico por {{name}}. {{propuesta_aliados}}", "Incluye logo en la portada y difusión en redes y newsletter.", "{{pregunta_presentacion}}"],
  },
  {
    label: "Primer contacto · Proveedores", purpose: "first_contact", managementType: "provider", subject: "Directorio de proveedores de Hospeda",
    email: [
      ...EMAIL_OPENING,
      "Me comunico por {{name}}. {{propuesta_proveedores}}",
      list(["Publicar es gratis y no hay comisiones.", "Los anfitriones contactan directo por WhatsApp.", "A cambio, cada proveedor ofrece un beneficio propio a los anfitriones."]),
      `Así funciona: ${link("link_proveedores")}`,
      "{{pregunta_presentacion}}",
    ],
    chat: [CHAT_OPENING, "Me comunico por {{name}}. {{propuesta_proveedores}}", "Publicar es gratis y el contacto es directo.", "{{pregunta_presentacion}}"],
  },
  {
    label: "Primer contacto · Editores", purpose: "first_contact", managementType: "editor", subject: "Colaboración editorial con Hospeda",
    email: [
      ...EMAIL_OPENING,
      "{{propuesta_editores}}",
      list(["Es una colaboración voluntaria y sin exclusividad.", "Cada editor tiene su página de autor.", "Difundimos lo publicado en nuestras redes.", "El texto sigue siendo de quien lo escribe."]),
      `Más detalles: ${link("link_editores")}`,
      "{{pregunta_presentacion}}",
    ],
    chat: [CHAT_OPENING, "{{propuesta_editores}}", "Es voluntario y sin exclusividad.", "{{pregunta_presentacion}}"],
  },
  {
    label: "Retomar conversación", purpose: "resume", managementType: null, subject: "Retomando lo de {{name}} y Hospeda",
    email: [...EMAIL_FOLLOW_UP, "Retomo lo que hablamos sobre {{name}} y Hospeda.", "{{#if temporada}}{{temporada}}{{/if}}", `Dejo de nuevo la información: ${link("link_presentacion")}`, "{{pregunta_retomar}}"],
    chat: [CHAT_FOLLOW_UP, "Retomo lo que hablamos sobre {{name}}.", "{{pregunta_retomar}}"],
  },
  {
    label: "Relación y novedades", purpose: "relationship", managementType: null, subject: "Novedades de Hospeda",
    email: [...EMAIL_FOLLOW_UP, "Comparto novedades de Hospeda: seguimos sumando alojamientos, gastronomía y experiencias de la región.", "La idea es que quien viaja encuentre todo en un solo lugar.", `Lo nuevo se publica en ${link("link_hospeda")} y en Instagram: ${link("link_instagram")}`],
    chat: [CHAT_FOLLOW_UP, "Seguimos sumando alojamientos, gastronomía y experiencias de la región.", "Lo nuevo lo publicamos en Instagram: {{link_instagram}}", "{{despedida}}"],
  },
  {
    label: "Acompañamiento · Bienvenida", purpose: "care", managementType: "accompaniment", subject: "Bienvenida a Hospeda · {{name}}",
    email: [
      ...EMAIL_FOLLOW_UP,
      "Gracias por sumar {{name}} a Hospeda.",
      "Para armar la ficha necesitamos:",
      list(MATERIAL),
      "Así sigue:",
      "<ol><li>Se crea la cuenta en Hospeda.</li><li>Armamos la ficha con ese material.</li><li>Al publicarla empiezan los 30 días de prueba.</li><li>Antes de que terminen, ayudamos a elegir el plan.</li></ol>",
      "Cualquier consulta, estamos en el {{telefono_hospeda}}.",
    ],
    chat: [CHAT_FOLLOW_UP, "Gracias por sumar {{name}} a Hospeda.", "Para armar la ficha necesitamos fotos, una descripción breve, horarios y datos de contacto.", "Al publicarla empiezan los 30 días de prueba.", "{{despedida}}"],
  },
  {
    label: "Acompañamiento · Fin de la prueba", purpose: "care", managementType: "accompaniment", subject: "La prueba de {{name}} en Hospeda está por terminar",
    email: [
      ...EMAIL_FOLLOW_UP,
      "La prueba de 30 días de {{name}} en Hospeda está por terminar.",
      "Para que la ficha siga visible, hay que elegir un plan desde la cuenta.",
      "Si no se elige ninguno, la ficha deja de verse, pero no se borra: vuelve a publicarse al elegir un plan.",
      `Si hace falta, ayudamos a elegir el plan que mejor se ajuste. Planes y detalles: ${link("link_presentacion")}`,
    ],
    chat: [CHAT_FOLLOW_UP, "La prueba de 30 días de {{name}} en Hospeda está por terminar.", "Para que la ficha siga visible hay que elegir un plan desde la cuenta. Si hace falta, ayudamos con eso.", "{{despedida}}"],
  },
  {
    label: "Coordinación · Pedido de material", purpose: "operations", managementType: null, subject: "Material para la ficha de {{name}}",
    email: [...EMAIL_FOLLOW_UP, "Para avanzar con la ficha de {{name}} en Hospeda necesitamos este material:", list(MATERIAL), "Se puede enviar respondiendo este correo o por WhatsApp al {{telefono_hospeda}}."],
    chat: [CHAT_FOLLOW_UP, "Para avanzar con la ficha de {{name}} necesitamos:", chatList(MATERIAL), "Se puede enviar por acá.", "{{despedida}}"],
  },
  {
    label: "Coordinación · Revisión de la ficha", purpose: "operations", managementType: null, subject: "Revisión de la ficha de {{name}}",
    email: [...EMAIL_FOLLOW_UP, "La ficha de {{name}} ya está armada{{#if hospeda_url}}: {{hospeda_url}}{{/if}}.", "Antes de publicarla conviene revisar que los datos y las fotos estén bien.", "Cualquier cambio, lo corregimos enseguida."],
    chat: [CHAT_FOLLOW_UP, "La ficha de {{name}} ya está armada{{#if hospeda_url}}: {{hospeda_url}}{{/if}}.", "Antes de publicarla conviene darle una mirada. Cualquier cambio, lo corregimos.", "{{despedida}}"],
  },
];

/** Lists are already block elements; everything else is a paragraph. */
const html = (blocks: string[]) => blocks.map(block => /^<(ul|ol)>/.test(block) ? block : `<p>${block}</p>`).join("");

/** Every base in Email, WhatsApp and Instagram, in a stable order (the migration and its drift test depend on it). */
export const MESSAGE_CATALOG_TEMPLATES: CatalogTemplate[] = BASES.flatMap(base => (["email", "whatsapp", "social"] as const).map(channel => ({
  name: `${base.label} · ${CHANNEL_LABELS[channel]}`,
  channel,
  purpose: base.purpose,
  managementType: base.managementType,
  subject: channel === "email" ? base.subject : null,
  body: channel === "email" ? html([...base.email, "{{despedida}}"]) : html(base.chat),
})));
