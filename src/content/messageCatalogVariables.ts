import type { MessageVariableAlternative, MessageVariableCondition, MessageVariableDefinition } from "../helpers/messageVariables";

/**
 * Message variable catalog approved in October 2026 (rebuilt from scratch).
 * Rules: every alternative of a variable uses the same condition keys, so the most specific group is always one register;
 * inside a group the engine picks one variant with a stable seed. Copy follows the public presentations of Hospeda:
 * no prices, no promises of traffic or results, contact is direct between business and customer.
 */

type Profile = "Independiente" | "Consolidado" | "Referente" | "none";
/** "Vos" register: independent businesses and businesses without a profile (generic tone). */
const VOS: Profile[] = ["Independiente", "none"];
/** "Ustedes" register: consolidated and reference businesses. */
const USTEDES: Profile[] = ["Consolidado", "Referente"];
const PERIODS = ["morning", "afternoon", "evening"] as const;
type Period = (typeof PERIODS)[number];

/** Alternatives sharing the same conditions, with stable ids `key-group-n`. */
const pool = (id: string, conditions: MessageVariableCondition, texts: readonly string[]): MessageVariableAlternative[] =>
  texts.map((text, index) => ({ id: `${id}-${index + 1}`, text, conditions }));

const text = (key: string, label: string, description: string, alternatives: MessageVariableAlternative[]): MessageVariableDefinition =>
  ({ key, label, description, source: { kind: "text", key: "" }, alternatives, active: true });

const crm = (key: string, label: string, description: string, source = key): MessageVariableDefinition =>
  ({ key, label, description, source: { kind: "crm", key: source }, alternatives: [], active: true });

const fixed = (key: string, label: string, description: string, value: string): MessageVariableDefinition =>
  text(key, label, description, pool(key, {}, [value]));

const greetingWord: Record<Period, [string, string]> = { morning: ["Buen día", "buen día"], afternoon: ["Buenas tardes", "buenas tardes"], evening: ["Buenas noches", "buenas noches"] };

const saludo = PERIODS.flatMap(period => {
  const [Upper, lower] = greetingWord[period];
  return [
    ...pool(`saludo-${period}-vos-nombre`, { dayPeriod: period, contactName: "present", commercialProfiles: VOS }, [`¡${Upper}, {{contact_first}}!`, `Hola {{contact_first}}, ${lower}.`, "¡Hola, {{contact_first}}! ¿Cómo va?", "Hola {{contact_first}}, ¿cómo estás?"]),
    ...pool(`saludo-${period}-vos-sin-nombre`, { dayPeriod: period, contactName: "missing", commercialProfiles: VOS }, [`¡${Upper}!`, `Hola, ${lower}.`, "¡Hola! ¿Cómo va?", "Hola, ¿cómo estás?"]),
    ...pool(`saludo-${period}-ustedes-nombre`, { dayPeriod: period, contactName: "present", commercialProfiles: USTEDES }, [`${Upper}, {{contact_first}}.`, `Hola {{contact_first}}, ${lower}.`, "Hola {{contact_first}}, ¿cómo están?"]),
    ...pool(`saludo-${period}-ustedes-sin-nombre`, { dayPeriod: period, contactName: "missing", commercialProfiles: USTEDES }, [`${Upper}.`, `Hola, ${lower}.`, "Hola, ¿cómo están?"]),
  ];
});

const despedidaTexts: Record<Period, { vos: string[]; ustedes: string[] }> = {
  morning: { vos: ["¡Que tengas buen día!", "Gracias por tu tiempo y buen día.", "Saludos y buen día."], ustedes: ["¡Que tengan buen día!", "Gracias por su tiempo y buen día.", "Saludos y buen día."] },
  afternoon: { vos: ["¡Que tengas buena tarde!", "Gracias por tu tiempo. ¡Buena tarde!", "Saludos y buena tarde."], ustedes: ["¡Que tengan buena tarde!", "Gracias por su tiempo. ¡Buena tarde!", "Saludos y buena tarde."] },
  evening: { vos: ["¡Que tengas buena noche!", "Gracias por tu tiempo. ¡Buena noche!", "Saludos y buena noche."], ustedes: ["¡Que tengan buena noche!", "Gracias por su tiempo. ¡Buena noche!", "Saludos y buena noche."] },
};
const FRIDAY = [5];
const despedida = PERIODS.flatMap(period => [
  ...pool(`despedida-${period}-vos`, { dayPeriod: period, commercialProfiles: VOS }, despedidaTexts[period].vos),
  ...pool(`despedida-${period}-ustedes`, { dayPeriod: period, commercialProfiles: USTEDES }, despedidaTexts[period].ustedes),
  // Friday afternoons and evenings close the week instead (more specific, so it wins over the daily texts).
  ...(period === "morning" ? [] : [
    ...pool(`despedida-${period}-viernes-vos`, { dayPeriod: period, commercialProfiles: VOS, weekdays: FRIDAY }, ["¡Buen fin de semana!", "Gracias por tu tiempo y buen finde.", "¡Que tengas un lindo fin de semana!"]),
    ...pool(`despedida-${period}-viernes-ustedes`, { dayPeriod: period, commercialProfiles: USTEDES, weekdays: FRIDAY }, ["¡Buen fin de semana!", "Gracias por su tiempo y buen fin de semana.", "¡Que tengan un lindo fin de semana!"]),
  ]),
]);

const presentacion = [
  ...pool("presentacion-email", { channel: "email" }, ["Mi nombre es {{sender}} y formo parte del equipo de {{que_es_hospeda}}.", "Soy {{sender}}, del equipo de {{que_es_hospeda}}.", "Mi nombre es {{sender}}, de {{que_es_hospeda}}."]),
  ...pool("presentacion-whatsapp", { channel: "whatsapp" }, ["Soy {{sender_short}}, de {{que_es_hospeda}}.", "Soy {{sender_short}}, del equipo de {{que_es_hospeda}}.", "Mi nombre es {{sender_short}} y formo parte de {{que_es_hospeda}}."]),
  ...pool("presentacion-social", { channel: "social" }, ["Soy {{sender_short}}, de {{que_es_hospeda}}.", "Acá {{sender_short}}, del equipo de {{que_es_hospeda}}.", "Mi nombre es {{sender_short}} y formo parte de {{que_es_hospeda}}."]),
];

const queEsHospeda = pool("que-es-hospeda", {}, [
  "Hospeda, la plataforma turística integral del Litoral",
  "Hospeda, una plataforma turística integral del Litoral que reúne alojamientos, gastronomía y experiencias",
  "Hospeda, la plataforma turística integral del Litoral donde los viajeros planifican su visita",
]);

/** Short local references, taken from the descriptions of the 22 destinations published by Hospeda. Other cities use the generic text. */
const CITY_REFERENCES: Record<string, string[]> = {
  "Colón": ["en Colón, con sus playas sobre el río Uruguay", "en Colón, ciudad de playas y termas"],
  "Concepción del Uruguay": ["en Concepción del Uruguay, primera capital histórica de Entre Ríos", "en Concepción del Uruguay, a orillas del río Uruguay"],
  "Gualeguaychú": ["en Gualeguaychú, Capital Nacional del Carnaval", "en Gualeguaychú, con su costanera y sus termas"],
  "Concordia": ["en Concordia, junto al lago Salto Grande", "en Concordia, Capital Nacional de la Citricultura"],
  "Federación": ["en Federación, ciudad termal a orillas del lago Salto Grande"],
  "Chajarí": ["en Chajarí, ciudad termal junto al lago Salto Grande"],
  "Villa Elisa": ["en Villa Elisa, ciudad termal y agroturística"],
  "San José": ["en San José, primera colonia agrícola organizada del país"],
  "Caseros": ["en Caseros, puerta de entrada al Palacio San José"],
  "Ubajay": ["en Ubajay, vecino al Parque Nacional El Palmar"],
  "Pueblo Liebig": ["en Pueblo Liebig, con su historia industrial a orillas del río Uruguay"],
  "Gualeguay": ["en Gualeguay, una de las ciudades más antiguas de Entre Ríos"],
  "San Salvador": ["en San Salvador, Capital Nacional del Arroz"],
  "Villaguay": ["en Villaguay, la Ciudad de los Encuentros"],
  "Villa Paranacito": ["en Villa Paranacito, en pleno Delta del Paraná"],
  "Ibicuy": ["en Ibicuy, en pleno delta entrerriano"],
  "Rosario del Tala": ["en Rosario del Tala, a orillas del río Gualeguay"],
  "Santa Ana": ["en Santa Ana, sobre el perilago de Salto Grande"],
  "Ceibas": ["en Ceibas, parada gastronómica clásica sobre la ruta 12"],
  "San Justo": ["en San Justo, colonia agrícola del departamento Uruguay"],
  "Urdinarrain": ["en Urdinarrain, pueblo rural con historia ferroviaria"],
  "Larroque": ["en Larroque, pueblo de tradición ferroviaria y agropecuaria"],
};
export const MESSAGE_CATALOG_CITIES = Object.keys(CITY_REFERENCES);
const refCiudad = [
  ...pool("ref-ciudad-general", {}, ["en {{city}}"]),
  ...Object.entries(CITY_REFERENCES).flatMap(([city, texts]) => pool(`ref-ciudad-${city.toLocaleLowerCase("es-AR").replace(/\s+/g, "-")}`, { cities: [city] }, texts)),
];

const etapaHospeda = pool("etapa-hospeda", {}, [
  "Hospeda ya está en línea y estamos sumando alojamientos, gastronomía y experiencias de la región: cuanto más completa esté la oferta, más útil es para quien viaja.",
  "Ya estamos en línea y el foco está en sumar alojamientos, restaurantes y experiencias de la zona, para que quien viaja encuentre todo en un solo lugar.",
  "Estamos dando los primeros pasos en línea y sumando a los negocios turísticos de la región: mientras más completa sea la oferta, más útil resulta para quien viaja.",
]);

const ALOJAMIENTOS = ["Alojamientos"], GASTRONOMIA = ["Gastronomía"], EXPERIENCIAS = ["Experiencias", "Turismo rural"];
const propuestaValor = [
  ...pool("propuesta-general-vos", { commercialProfiles: VOS }, ["Tu negocio tiene su propia ficha y el contacto con el cliente es directo, sin comisiones.", "Publicás tu propuesta con fotos y datos de contacto, y el cliente te escribe directo, sin intermediarios."]),
  ...pool("propuesta-general-ustedes", { commercialProfiles: USTEDES }, ["El negocio tiene su propia ficha y el contacto con el cliente es directo, sin comisiones.", "Publican su propuesta con fotos y datos de contacto, y el cliente les escribe directo, sin intermediarios."]),
  ...pool("propuesta-alojamientos-vos", { verticals: ALOJAMIENTOS, commercialProfiles: VOS }, ["Publicar no tiene comisión: el huésped te contacta directo y vos acordás la reserva, la seña y las condiciones.", "No hay comisiones por reserva ni por consulta: es una cuota fija y el huésped te escribe directo.", "Tu alojamiento tiene su propia ficha con fotos, servicios y calendario, y el huésped te contacta sin intermediarios ni comisiones."]),
  ...pool("propuesta-alojamientos-ustedes", { verticals: ALOJAMIENTOS, commercialProfiles: USTEDES }, ["Publicar no tiene comisión: el huésped los contacta directo y ustedes acuerdan la reserva, la seña y las condiciones.", "No hay comisiones por reserva ni por consulta: es una cuota fija y el huésped les escribe directo.", "El alojamiento tiene su propia ficha con fotos, servicios y calendario, y el huésped los contacta sin intermediarios ni comisiones."]),
  ...pool("propuesta-gastronomia-vos", { verticals: GASTRONOMIA, commercialProfiles: VOS }, ["Tu local tiene su propia página con carta, horarios, fotos y mapa, y los clientes te contactan directo, sin comisiones.", "Es una forma simple de que quien llega a la zona encuentre tu carta, tus horarios y cómo contactarte, sin comisiones por pedido ni por reserva.", "Podés mostrar la carta plato por plato, el menú del día y tus eventos, y el contacto con el cliente es directo."]),
  ...pool("propuesta-gastronomia-ustedes", { verticals: GASTRONOMIA, commercialProfiles: USTEDES }, ["El local tiene su propia página con carta, horarios, fotos y mapa, y los clientes los contactan directo, sin comisiones.", "Es una forma simple de que quien llega a la zona encuentre su carta, sus horarios y cómo contactarlos, sin comisiones por pedido ni por reserva.", "Pueden mostrar la carta plato por plato, el menú del día y sus eventos, y el contacto con el cliente es directo."]),
  ...pool("propuesta-experiencias-vos", { verticals: EXPERIENCIAS, commercialProfiles: VOS }, ["Tu experiencia tiene su ficha con fotos, duración, punto de encuentro y precio de referencia, y el turista te contacta directo, sin comisiones.", "Quien ya reservó alojamiento en la zona entra a Hospeda a decidir qué hacer esos días: la idea es que tu propuesta esté ahí.", "Publicás tu salida con todos sus detalles y el contacto con el turista es directo: no cobramos comisión por reserva."]),
  ...pool("propuesta-experiencias-ustedes", { verticals: EXPERIENCIAS, commercialProfiles: USTEDES }, ["La experiencia tiene su ficha con fotos, duración, punto de encuentro y precio de referencia, y el turista los contacta directo, sin comisiones.", "Quien ya reservó alojamiento en la zona entra a Hospeda a decidir qué hacer esos días: la idea es que su propuesta esté ahí.", "Publican la salida con todos sus detalles y el contacto con el turista es directo: no cobramos comisión por reserva."]),
];

const pruebaGratis = [
  ...pool("prueba-vos", { commercialProfiles: VOS }, ["Tenés 30 días gratis para probarlo, sin tarjeta.", "La prueba es de 30 días sin costo y no pide tarjeta.", "Podés probarlo 30 días gratis, sin cargar tarjeta."]),
  ...pool("prueba-ustedes", { commercialProfiles: USTEDES }, ["Tienen 30 días gratis para probarlo, sin tarjeta.", "La prueba es de 30 días sin costo y no pide tarjeta.", "Pueden probarlo 30 días gratis, sin cargar tarjeta."]),
];

const ayudaFicha = [
  ...pool("ayuda-vos", { commercialProfiles: VOS }, ["Si querés, te armamos la ficha con las fotos y los datos que nos pases; vos solo creás la cuenta.", "No hace falta que cargues todo: nos pasás el material y armamos la ficha con vos.", "Te ayudamos con la carga: con tus fotos y datos dejamos la ficha lista para publicar."]),
  ...pool("ayuda-ustedes", { commercialProfiles: USTEDES }, ["Si quieren, les armamos la ficha con las fotos y los datos que nos pasen; solo tienen que crear la cuenta.", "No hace falta que carguen todo: nos pasan el material y armamos la ficha juntos.", "Los ayudamos con la carga: con sus fotos y datos dejamos la ficha lista para publicar."]),
];

const temporada = [
  ...pool("temporada-verano", { months: [12, 1, 2] }, ["Con la temporada de verano en marcha, es un buen momento para estar en Hospeda.", "Ahora que arrancó la temporada de verano, es un buen momento para tener la ficha publicada."]),
  ...pool("temporada-previa-verano", { months: [10, 11] }, ["Con la temporada de verano cerca, es un buen momento para sumarse.", "Pensando en el verano que se viene, es un buen momento para estar en Hospeda."]),
  ...pool("temporada-invierno", { months: [6, 7] }, ["Pensando en las vacaciones de invierno, es un buen momento para sumarse."]),
];

const BASE = "https://hospeda.com.ar/es/presentacion";
const linkPresentacion = [
  ...pool("link-general", {}, ["https://hospeda.com.ar"]),
  ...pool("link-alojamientos", { verticals: ALOJAMIENTOS }, [`${BASE}/alojamientos/`]),
  ...pool("link-gastronomia", { verticals: GASTRONOMIA }, [`${BASE}/gastronomia/`]),
  ...pool("link-experiencias", { verticals: EXPERIENCIAS }, [`${BASE}/experiencias/`]),
];

const propuestaAliados = [
  ...pool("aliados-vos", { commercialProfiles: VOS }, ["El programa de aliados es para quien quiere acompañar al turismo del Litoral con una presencia estable en Hospeda: logo en la portada, difusión en nuestras redes y en el newsletter, con registro de cada aparición.", "La idea es que estés presente justo donde se decide el viaje: en la portada de Hospeda, en nuestras redes y en el newsletter, con constancia de cada publicación."]),
  ...pool("aliados-ustedes", { commercialProfiles: USTEDES }, ["El programa de aliados es para quien quiere acompañar al turismo del Litoral con una presencia estable en Hospeda: logo en la portada, difusión en nuestras redes y en el newsletter, con registro de cada aparición.", "La idea es que estén presentes justo donde se decide el viaje: en la portada de Hospeda, en nuestras redes y en el newsletter, con constancia de cada publicación."]),
];
const propuestaProveedores = [
  ...pool("proveedores-vos", { commercialProfiles: VOS }, ["Estamos armando un directorio de proveedores para los anfitriones de la zona: publicar es gratis, sin comisiones, y te contactan directo por WhatsApp a cambio de un beneficio que vos definís.", "Los anfitriones de Hospeda buscan servicios de confianza cerca de sus alojamientos: sumarte al directorio es gratis y el contacto es directo, ofreciendo un beneficio propio."]),
  ...pool("proveedores-ustedes", { commercialProfiles: USTEDES }, ["Estamos armando un directorio de proveedores para los anfitriones de la zona: publicar es gratis, sin comisiones, y los contactan directo por WhatsApp a cambio de un beneficio que ustedes definen.", "Los anfitriones de Hospeda buscan servicios de confianza cerca de sus alojamientos: sumarse al directorio es gratis y el contacto es directo, ofreciendo un beneficio propio."]),
];
const propuestaEditores = [
  ...pool("editores-vos", { commercialProfiles: VOS }, ["Buscamos personas que conozcan la región para escribir notas o cargar eventos en la agenda de Hospeda. Es una colaboración voluntaria: tenés tu página de autor, difusión en nuestras redes y el texto sigue siendo tuyo.", "Estamos sumando editores que quieran contar el Litoral: notas, eventos y recomendaciones. Es voluntario, sin exclusividad, con página de autor y difusión de lo que publiques."]),
  ...pool("editores-ustedes", { commercialProfiles: USTEDES }, ["Buscamos a quienes conozcan la región para escribir notas o cargar eventos en la agenda de Hospeda. Es una colaboración voluntaria: tienen página de autor, difusión en nuestras redes y el contenido sigue siendo de ustedes.", "Estamos sumando editores que quieran contar el Litoral: notas, eventos y recomendaciones. Es voluntario, sin exclusividad, con página de autor y difusión de lo que publiquen."]),
];

const preguntaPresentacion = [
  ...pool("pregunta-presentacion-vos", { commercialProfiles: VOS }, ["¿Te cuento cómo funciona?", "¿Te interesa que te pase más información?", "¿Te parece si lo charlamos un rato?"]),
  ...pool("pregunta-presentacion-consolidado", { commercialProfiles: ["Consolidado"] }, ["¿Les interesa que les comparta más información?", "¿Les parece si lo charlamos un rato?", "¿Les cuento cómo funciona?"]),
  ...pool("pregunta-presentacion-referente", { commercialProfiles: ["Referente"] }, ["¿Con quién podríamos coordinar una breve charla para presentarles la propuesta?", "¿Les parece si coordinamos una charla corta para contarles la propuesta?"]),
];
const preguntaRetomar = [
  ...pool("pregunta-retomar-vos", { commercialProfiles: VOS }, ["¿Pudiste verlo? Si te sirve, lo charlamos cuando te quede cómodo.", "¿Querés que lo retomemos? Te cuento lo que necesites.", "¿Te parece si lo retomamos esta semana?"]),
  ...pool("pregunta-retomar-ustedes", { commercialProfiles: USTEDES }, ["¿Pudieron verlo? Si les sirve, lo charlamos cuando les quede cómodo.", "¿Quieren que lo retomemos? Les cuento lo que necesiten.", "¿Les parece si lo retomamos esta semana?"]),
];

/** Variables that read CRM or system data. `business_status` and `is_client` stay out: they are conditions, never printed. */
const dataVariables: MessageVariableDefinition[] = [
  crm("name", "Nombre del negocio", "Nombre del negocio en el CRM."),
  crm("city", "Localidad", "Localidad del negocio."),
  crm("type", "Rubro", "Rubro (vertical) del negocio."),
  crm("subtype", "Tipo de negocio", "Tipo de negocio dentro del rubro."),
  crm("contact", "Persona de contacto", "Nombre completo de la persona elegida."),
  crm("contact_first", "Nombre de pila", "Primer nombre de la persona elegida."),
  crm("sender", "Responsable", "Nombre completo del responsable del negocio."),
  crm("sender_short", "Responsable (corto)", "Nombre visible del responsable."),
  crm("sender_email", "Email del responsable", "Email del responsable del negocio."),
  crm("website", "Sitio web", "Sitio web del negocio."),
  crm("hospeda_url", "Ficha pública", "Enlace a la ficha pública en Hospeda, si existe."),
];

/** Full catalog in display order. */
export const MESSAGE_CATALOG_VARIABLES: MessageVariableDefinition[] = [
  ...dataVariables,
  text("saludo", "Saludo", "Saludo según la hora, el perfil y si hay nombre de contacto.", saludo),
  text("presentacion", "Presentación", "Quién escribe y qué es Hospeda, según el canal.", presentacion),
  text("que_es_hospeda", "Qué es Hospeda", "Descripción breve de Hospeda (se usa dentro de la presentación).", queEsHospeda),
  text("ref_ciudad", "Referencia a la ciudad", "Mención de la localidad; los 22 destinos de Hospeda tienen frases propias.", refCiudad),
  text("etapa_hospeda", "Etapa de Hospeda", "Explica con honestidad que Hospeda está en línea y sumando oferta.", etapaHospeda),
  text("propuesta_valor", "Propuesta de valor", "Qué gana el negocio según su rubro y perfil.", propuestaValor),
  text("prueba_gratis", "Prueba gratis", "Los 30 días de prueba sin tarjeta.", pruebaGratis),
  text("ayuda_ficha", "Ayuda con la ficha", "Ofrece armar la ficha con el material del negocio.", ayudaFicha),
  text("temporada", "Temporada", "Referencia a la temporada según el mes; vacía el resto del año.", temporada),
  text("propuesta_aliados", "Propuesta para aliados", "Programa de aliados (Partners).", propuestaAliados),
  text("propuesta_proveedores", "Propuesta para proveedores", "Directorio de proveedores para anfitriones.", propuestaProveedores),
  text("propuesta_editores", "Propuesta para editores", "Colaboración editorial voluntaria.", propuestaEditores),
  text("pregunta_presentacion", "Pregunta de cierre (presentación)", "Cierre del primer contacto, según el perfil.", preguntaPresentacion),
  text("pregunta_retomar", "Pregunta de cierre (retomar)", "Cierre para retomar una conversación.", preguntaRetomar),
  text("despedida", "Despedida", "Cierre cordial según la hora y el día.", despedida),
  text("link_presentacion", "Presentación por rubro", "Página de presentación del rubro del negocio.", linkPresentacion),
  fixed("link_aliados", "Presentación para aliados", "Página del programa de aliados.", `${BASE}/aliados/`),
  fixed("link_proveedores", "Presentación para proveedores", "Página del directorio de proveedores.", `${BASE}/proveedores/`),
  fixed("link_editores", "Presentación para editores", "Página de la colaboración editorial.", `${BASE}/editores/`),
  fixed("link_hospeda", "Sitio de Hospeda", "Sitio principal.", "https://hospeda.com.ar"),
  fixed("link_instagram", "Instagram de Hospeda", "Cuenta de Instagram.", "https://www.instagram.com/hospeda.com.ar/"),
  fixed("telefono_hospeda", "Teléfono de Hospeda", "Teléfono comercial que usan todos los vendedores.", "3442 470650"),
];
