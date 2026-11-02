import type { ContactPurpose } from "../helpers/contactPurpose";
import type { ManagementType } from "../helpers/businessManagement";

/** Message catalog source. Variable copy and selection rules live in messageCatalogVariables.ts. */
export type CatalogChannel = "email" | "whatsapp" | "social";
export type CatalogTemplate = {
  name: string;
  channel: CatalogChannel;
  purpose: ContactPurpose;
  managementType: ManagementType | null;
  vertical: string | null;
  subject: string | null;
  body: string;
  /** Title of the sales material that goes inside this message (sent right after the prospect says yes). The migration resolves it by title. */
  material: string | null;
};

type Base = {
  label: string;
  purpose: ContactPurpose;
  managementType: ManagementType | null;
  vertical?: string | null;
  material?: string;
  subject: string;
  email: string[];
  chat: string[];
  channels?: readonly CatalogChannel[];
};

const CHANNEL_LABELS: Record<CatalogChannel, string> = { email: "Email", whatsapp: "WhatsApp", social: "Instagram" };
const EMAIL_OPENING = ["{{saludo}}", "{{presentacion}}"];
const CHAT_OPENING = "{{saludo}} {{presentacion}}";
const EMAIL_FOLLOW_UP = ["{{saludo}} {{presentacion_breve}}"];
const CHAT_FOLLOW_UP = "{{saludo}} {{presentacion_breve}}";
const link = (key: string) => `<a href="{{${key}}}">{{${key}}}</a>`;
const list = (items: readonly string[]) => `<ul>${items.map(item => `<li>${item}</li>`).join("")}</ul>`;
const MATERIAL = ["Fotos (la principal y algunas más)", "Una descripción breve", "Horarios y datos de contacto", "Redes o sitio web, si hay"];
const chatList = (items: readonly string[]) => items.map(item => `• ${item}`).join("<br>");
const EMAIL_RESUME = (subject: string, body: string[]) => ({ label: subject, purpose: "resume" as const, managementType: null, subject, email: ["{{saludo}}", ...body, "{{despedida}}"], chat: body });

const BASES: Base[] = [
  {
    label: "Verificación del negocio", purpose: "verification", managementType: null, subject: "Consulta sobre {{name}}",
    email: [...EMAIL_OPENING, "Quería confirmar un dato: ¿este es el contacto de {{name}}{{#if city}} en {{city}}{{/if}}?", "Estamos actualizando la información de los negocios turísticos de la zona y queremos que los datos estén al día."],
    chat: [CHAT_OPENING, "¿Este es el contacto de {{name}}{{#if city}} en {{city}}{{/if}}?", "Estamos actualizando los datos de los negocios turísticos de la zona."],
  },
  {
    label: "Primer contacto · Verticales principales", purpose: "first_contact", managementType: "main", subject: "Sumar {{name}} a Hospeda",
    email: [...EMAIL_OPENING, "Me comunico por {{name}}.{{#if city}} Queremos que quien planea una visita encuentre en un solo lugar dónde dormir, dónde comer y qué hacer {{ref_ciudad}}.{{/if}}", "{{etapa_hospeda}}", "{{propuesta_valor}}", "<strong>Para probarlo:</strong> {{prueba_gratis}}", "{{#if temporada}}{{temporada}}{{/if}}", `Toda la información está acá: ${link("link_presentacion")}`, "{{pregunta_presentacion}}"],
    chat: [CHAT_OPENING, "Me comunico por {{name}}. {{etapa_corta}}", "{{propuesta_corta}} {{prueba_corta}}", "{{pregunta_presentacion}}"],
  },
  {
    label: "Primer contacto · Aliados", purpose: "first_contact", managementType: "partner", subject: "Programa de aliados de Hospeda",
    email: [...EMAIL_OPENING, "Me comunico por {{name}}. {{propuesta_aliados}}", "El programa incluye:", list(["Logo en la portada de Hospeda", "Difusión en nuestras redes y en el newsletter", "Registro de cada aparición"]), "{{etapa_hospeda}}", `El nivel y los valores se definen en una charla, según cada caso. Más información: ${link("link_aliados")}`, "{{pregunta_presentacion}}"],
    chat: [CHAT_OPENING, "Me comunico por {{name}}. {{propuesta_aliados}}", "Incluye logo en la portada y difusión en redes y newsletter.", "{{pregunta_presentacion}}"],
  },
  {
    label: "Primer contacto · Proveedores", purpose: "first_contact", managementType: "provider", subject: "Directorio de proveedores de Hospeda",
    email: [...EMAIL_OPENING, "Me comunico por {{name}}. {{propuesta_proveedores}}", list(["Publicar es gratis y no hay comisiones.", "Los anfitriones contactan directo por WhatsApp.", "A cambio, cada proveedor ofrece un beneficio propio a los anfitriones."]), `Así funciona: ${link("link_proveedores")}`, "{{pregunta_presentacion}}"],
    chat: [CHAT_OPENING, "Me comunico por {{name}}. {{propuesta_proveedores}}", "Publicar es gratis y el contacto es directo.", "{{pregunta_presentacion}}"],
  },
  {
    label: "Primer contacto · Editores", purpose: "first_contact", managementType: "editor", subject: "Colaboración editorial con Hospeda",
    email: [...EMAIL_OPENING, "{{propuesta_editores}}", list(["Es una colaboración voluntaria y sin exclusividad.", "Cada editor tiene su página de autor.", "Difundimos lo publicado en nuestras redes.", "El texto sigue siendo de quien lo escribe."]), `Más detalles: ${link("link_editores")}`, "{{pregunta_presentacion}}"],
    chat: [CHAT_OPENING, "{{propuesta_editores}}", "Es voluntario y sin exclusividad.", "{{pregunta_presentacion}}"],
  },
  {
    ...EMAIL_RESUME("Envío de la información · Alojamientos", ["¡Buenísimo, gracias! Acá va la presentación para mirarla con tiempo.", "{{cta_registro}} {{prueba_corta}}", `Los planes, para cuando termine la prueba: ${link("link_planes")}`, "{{ofrecer_ayuda}}"]),
    material: "Presentacion Alojamientos", managementType: "main", vertical: "Alojamientos", subject: "La presentación de Hospeda para {{name}}",
    chat: ["¡Buenísimo, gracias! Acá va la presentación para mirarla con tiempo.", "{{cta_registro}} {{prueba_corta}}", "Los planes, para cuando termine la prueba: {{link_planes}}", "{{ofrecer_ayuda}}"],
  },
  {
    ...EMAIL_RESUME("Envío de la información · Otros rubros", ["¡Buenísimo, gracias! Acá va la presentación para mirarla con tiempo.", "{{cta_registro}} {{prueba_corta}}", `Los planes, para cuando termine la prueba: ${link("link_planes")}`, "{{ofrecer_ayuda}}"]),
    material: "Folleto", managementType: "main", vertical: null, subject: "La presentación de Hospeda para {{name}}",
    chat: ["¡Buenísimo, gracias! Acá va la presentación para mirarla con tiempo.", "{{cta_registro}} {{prueba_corta}}", "Los planes, para cuando termine la prueba: {{link_planes}}", "{{ofrecer_ayuda}}"],
  },
  {
    ...EMAIL_RESUME("Envío de la información · Proveedores", ["¡Buenísimo, gracias! Acá va la presentación para mirarla con tiempo.", "{{cta_registro}}", `Así funciona el directorio: ${link("link_proveedores")}`, "{{ofrecer_ayuda}}"]),
    material: "Presentacion a proveedores", managementType: "provider", subject: "La presentación de Hospeda para {{name}}",
    chat: ["¡Buenísimo, gracias! Acá va la presentación para mirarla con tiempo.", "{{cta_registro}}", "Así funciona el directorio: {{link_proveedores}}", "{{ofrecer_ayuda}}"],
  },
  {
    ...EMAIL_RESUME("Envío de la información · Aliados", ["¡Buenísimo, gracias! Acá va la presentación del programa para mirarla con tiempo.", `Más detalles del programa: ${link("link_aliados")}`, "El nivel y los valores los definimos en una charla corta. {{pregunta_charla}}"]),
    material: "3 formas de estar en Hospeda", managementType: "partner", subject: "La presentación de Hospeda para {{name}}",
    chat: ["¡Buenísimo, gracias! Acá va la presentación del programa para mirarla con tiempo.", "Más detalles del programa: {{link_aliados}}", "El nivel y los valores los definimos en una charla corta. {{pregunta_charla}}"],
  },
  {
    label: "Seguimiento", purpose: "resume", managementType: null, subject: "Sobre {{name}} y Hospeda",
    email: ["{{saludo}} {{presentacion_breve}}", `Hace unos días escribí por {{name}}. Por si sirve para mirarlo con tiempo: ${link("link_presentacion")}`, "{{pregunta_retomar}}", "{{despedida}}"],
    chat: [CHAT_FOLLOW_UP, "Hace unos días escribí por {{name}}. Por si sirve para mirarlo con tiempo: {{link_presentacion}}", "{{pregunta_retomar}}"],
  },
  {
    label: "Último seguimiento", purpose: "resume", managementType: null, subject: "Último mensaje sobre {{name}}",
    email: ["{{saludo}} {{presentacion_breve}}", "Para no insistir de más, este es el último mensaje por {{name}}. Si más adelante surge el interés, por acá seguimos.", `Mientras tanto, en Instagram vamos mostrando lo nuevo: ${link("link_instagram")}`, "{{despedida}}"],
    chat: [CHAT_FOLLOW_UP, "Para no insistir de más, este es el último mensaje por {{name}}. Si más adelante surge el interés, por acá seguimos.", "Mientras tanto, en Instagram vamos mostrando lo nuevo: {{link_instagram}}", "{{despedida}}"],
  },
  {
    label: "Te armamos la ficha", purpose: "operations", managementType: null, subject: "Armamos la ficha de {{name}}",
    email: ["{{saludo}}", "{{oferta_armado}}", chatList(MATERIAL), "Con eso armamos la ficha y la revisamos juntos.", "{{despedida}}"],
    chat: ["{{oferta_armado}}", chatList(MATERIAL), "Con eso armamos la ficha y la revisamos juntos."],
  },
  {
    label: "Bienvenida", purpose: "care", managementType: "accompaniment", subject: "Bienvenida a Hospeda · {{name}}", channels: ["email", "whatsapp"],
    email: ["{{saludo}} {{presentacion_breve}}", "¡Gracias por registrar {{name}} en Hospeda! {{paso_ficha}}", `{{ofrecer_ayuda}} También están las preguntas frecuentes: ${link("link_faq")}`, "{{despedida}}"],
    chat: [CHAT_FOLLOW_UP, "¡Gracias por registrar {{name}} en Hospeda! {{paso_ficha}}", "{{ofrecer_ayuda}} También están las preguntas frecuentes: {{link_faq}}", "{{despedida}}"],
  },
  {
    label: "Revisión de la ficha", purpose: "operations", managementType: null, subject: "Revisión de la ficha de {{name}}", channels: ["email", "whatsapp"],
    email: [...EMAIL_FOLLOW_UP, "La ficha de {{name}} ya está armada{{#if hospeda_url}}: {{hospeda_url}}{{/if}}.", "Antes de publicarla conviene revisar que los datos y las fotos estén bien.", "Cualquier cambio, lo corregimos enseguida."],
    chat: [CHAT_FOLLOW_UP, "La ficha de {{name}} ya está armada{{#if hospeda_url}}: {{hospeda_url}}{{/if}}.", "Antes de publicarla conviene darle una mirada. Cualquier cambio, lo corregimos.", "{{despedida}}"],
  },
  {
    label: "Fin de la prueba", purpose: "care", managementType: "accompaniment", subject: "La prueba de {{name}} en Hospeda está por terminar", channels: ["email", "whatsapp"],
    email: ["{{saludo}} {{presentacion_breve}}", `La prueba de 30 días de {{name}} en Hospeda está por terminar. Para que la ficha siga visible hay que elegir un plan desde la cuenta. Los planes están acá: ${link("link_planes")}`, "Si hace falta, ayudamos a elegir el plan que más convenga.", "{{despedida}}"],
    chat: [CHAT_FOLLOW_UP, "La prueba de 30 días de {{name}} en Hospeda está por terminar. Para que la ficha siga visible hay que elegir un plan desde la cuenta. Los planes están acá: {{link_planes}}", "Si hace falta, ayudamos a elegir el plan que más convenga.", "{{despedida}}"],
  },
];

/** Lists are already block elements; everything else is a paragraph. */
const html = (blocks: string[]) => blocks.map(block => /^<(ul|ol)>/.test(block) ? block : `<p>${block}</p>`).join("");

/** Instagram variant of a chat body: where the material would go, main rubros link the web presentation (providers and partners already link theirs). */
const instagramChat = (base: Base): string[] => base.material && base.managementType === "main" ? [base.chat[0], "{{link_presentacion}}", ...base.chat.slice(1)] : base.chat;

export const MESSAGE_CATALOG_TEMPLATES: CatalogTemplate[] = BASES.flatMap(base => (base.channels ?? ["email", "whatsapp", "social"]).map(channel => ({
  name: `${base.label} · ${CHANNEL_LABELS[channel]}`,
  channel,
  purpose: base.purpose,
  managementType: base.managementType,
  vertical: base.vertical ?? null,
  subject: channel === "email" ? base.subject : null,
  body: channel === "email" ? html(base.email.includes("{{despedida}}") ? base.email : [...base.email, "{{despedida}}"] ) : html(channel === "social" ? instagramChat(base) : base.chat),
  // Instagram drafts do not resolve material references: the main rubros get the web presentation instead.
  material: channel === "social" ? null : base.material ?? null,
})));
