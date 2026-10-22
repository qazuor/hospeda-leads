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
  ...pool("presentacion-whatsapp", { channel: "whatsapp" }, ["Soy {{sender_short}}, de Hospeda, la plataforma turística integral del Litoral.", "Soy {{sender_short}}, del equipo de Hospeda, la plataforma turística integral del Litoral.", "Mi nombre es {{sender_short}} y trabajo en Hospeda, la plataforma turística integral del Litoral."]),
  ...pool("presentacion-social", { channel: "social" }, ["Soy {{sender_short}}, de Hospeda, la plataforma turística integral del Litoral.", "Acá {{sender_short}}, del equipo de Hospeda, la plataforma turística integral del Litoral.", "Mi nombre es {{sender_short}} y trabajo en Hospeda, la plataforma turística integral del Litoral."]),
];

const queEsHospeda = pool("que-es-hospeda", {}, [
  "Hospeda, la plataforma turística integral del Litoral",
  "Hospeda, una plataforma turística integral del Litoral que reúne alojamientos, gastronomía y experiencias",
  "Hospeda, la plataforma turística integral del Litoral donde los viajeros planifican su visita",
]);

/** Short local references that close a sentence ("...qué hacer en Colón, con sus playas..."), never the opening. Taken from the descriptions of the 22 destinations published by Hospeda. Other cities use the generic text. */
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

/** Honest stage of Hospeda for email: online, still early and with low traffic, adding supply so it becomes useful. */
const etapaHospeda = pool("etapa-hospeda", {}, [
  "Hospeda ya está en línea, pero recién arranca y el tráfico todavía es bajo. Por eso hoy el foco está en sumar alojamientos, gastronomía y experiencias: cuanto más completa esté la oferta, más útil va a ser para quien viaja.",
  "La plataforma está en línea hace poco y todavía tiene pocas visitas. Estamos sumando a los negocios turísticos de la región para que a quien viaja le sirva de verdad y las visitas crezcan.",
  "Estamos dando los primeros pasos: el sitio ya está en línea y estamos sumando la oferta turística de la zona. Mientras más negocios se sumen, más útil va a ser para quien viaja, y eso es lo que hace crecer las visitas.",
]);
/** One-line version of the stage for WhatsApp and Instagram. */
const etapaCorta = pool("etapa-corta", {}, [
  "Estamos recién arrancando y sumando a los negocios de la zona.",
  "Arrancamos hace poco y estamos sumando la oferta turística de la región.",
  "Ya estamos en línea y estamos sumando a los negocios turísticos de la zona.",
]);

const ALOJAMIENTOS = ["Alojamientos"], GASTRONOMIA = ["Gastronomía"], EXPERIENCIAS = ["Experiencias", "Turismo rural"];
/** Email value proposition. The business is not in Hospeda yet: copy talks in conditional ("tendría") or about businesses in general. */
const propuestaValor = [
  ...pool("propuesta-general-vos", { commercialProfiles: VOS }, ["Tu negocio tendría su propia ficha en Hospeda y el contacto con el cliente sería directo, sin comisiones.", "Los negocios que se suman publican su propuesta con fotos y datos de contacto, y reciben las consultas directo, sin intermediarios."]),
  ...pool("propuesta-general-ustedes", { commercialProfiles: USTEDES }, ["El negocio tendría su propia ficha en Hospeda y el contacto con el cliente sería directo, sin comisiones.", "Los negocios que se suman publican su propuesta con fotos y datos de contacto, y reciben las consultas directo, sin intermediarios."]),
  ...pool("propuesta-alojamientos-vos", { verticals: ALOJAMIENTOS, commercialProfiles: VOS }, ["Tu alojamiento tendría su propia ficha, con fotos, servicios y calendario. El huésped te escribiría directo y vos acordarías la reserva y las condiciones, sin comisiones.", "Los alojamientos que se suman publican su ficha con fotos y servicios, y reciben las consultas directo, sin intermediarios ni comisiones por reserva.", "La propuesta es simple: una ficha para tu alojamiento y el contacto directo con el huésped. No hay comisiones por reserva ni por consulta."]),
  ...pool("propuesta-alojamientos-ustedes", { verticals: ALOJAMIENTOS, commercialProfiles: USTEDES }, ["El alojamiento tendría su propia ficha, con fotos, servicios y calendario. El huésped les escribiría directo y ustedes acordarían la reserva y las condiciones, sin comisiones.", "Los alojamientos que se suman publican su ficha con fotos y servicios, y reciben las consultas directo, sin intermediarios ni comisiones por reserva.", "La propuesta es simple: una ficha para el alojamiento y el contacto directo con el huésped. No hay comisiones por reserva ni por consulta."]),
  ...pool("propuesta-gastronomia-vos", { verticals: GASTRONOMIA, commercialProfiles: VOS }, ["Tu local tendría su propia página, con carta, horarios, fotos y ubicación. Los clientes te contactarían directo, sin comisiones por pedido ni por reserva.", "Los locales gastronómicos que se suman muestran su carta, el menú del día y sus horarios, y el cliente los contacta directo. No hay comisiones.", "La idea es que quien llega a la zona encuentre tu carta, tus horarios y cómo contactarte, sin comisiones de por medio."]),
  ...pool("propuesta-gastronomia-ustedes", { verticals: GASTRONOMIA, commercialProfiles: USTEDES }, ["El local tendría su propia página, con carta, horarios, fotos y ubicación. Los clientes los contactarían directo, sin comisiones por pedido ni por reserva.", "Los locales gastronómicos que se suman muestran su carta, el menú del día y sus horarios, y el cliente los contacta directo. No hay comisiones.", "La idea es que quien llega a la zona encuentre su carta, sus horarios y cómo contactarlos, sin comisiones de por medio."]),
  ...pool("propuesta-experiencias-vos", { verticals: EXPERIENCIAS, commercialProfiles: VOS }, ["Tu experiencia tendría su ficha con fotos, duración, punto de encuentro y precio de referencia. El turista te contactaría directo y no cobramos comisión por reserva.", "Quien ya tiene alojamiento en la zona entra a Hospeda a decidir qué hacer esos días. La idea es que tu propuesta esté ahí.", "Las experiencias que se suman publican su salida con todos los detalles, y el turista las contacta directo, sin comisiones."]),
  ...pool("propuesta-experiencias-ustedes", { verticals: EXPERIENCIAS, commercialProfiles: USTEDES }, ["La experiencia tendría su ficha con fotos, duración, punto de encuentro y precio de referencia. El turista los contactaría directo y no cobramos comisión por reserva.", "Quien ya tiene alojamiento en la zona entra a Hospeda a decidir qué hacer esos días. La idea es que su propuesta esté ahí.", "Las experiencias que se suman publican su salida con todos los detalles, y el turista las contacta directo, sin comisiones."]),
];
/** One-line value proposition for WhatsApp and Instagram. */
const propuestaCorta = [
  ...pool("propuesta-corta-general-vos", { commercialProfiles: VOS }, ["La idea es que tu negocio tenga su ficha y que los clientes te escriban directo, sin comisiones.", "La propuesta es una ficha para tu negocio, con contacto directo con el cliente y sin comisiones."]),
  ...pool("propuesta-corta-general-ustedes", { commercialProfiles: USTEDES }, ["La idea es que el negocio tenga su ficha y que los clientes les escriban directo, sin comisiones.", "La propuesta es una ficha para el negocio, con contacto directo con el cliente y sin comisiones."]),
  ...pool("propuesta-corta-alojamientos-vos", { verticals: ALOJAMIENTOS, commercialProfiles: VOS }, ["La idea es que tu alojamiento tenga su ficha y que los huéspedes te escriban directo, sin comisiones por reserva.", "La propuesta es una ficha para tu alojamiento, con contacto directo con el huésped y sin comisiones."]),
  ...pool("propuesta-corta-alojamientos-ustedes", { verticals: ALOJAMIENTOS, commercialProfiles: USTEDES }, ["La idea es que el alojamiento tenga su ficha y que los huéspedes les escriban directo, sin comisiones por reserva.", "La propuesta es una ficha para el alojamiento, con contacto directo con el huésped y sin comisiones."]),
  ...pool("propuesta-corta-gastronomia-vos", { verticals: GASTRONOMIA, commercialProfiles: VOS }, ["La idea es que tu local tenga su página con carta y horarios, y que los clientes te contacten directo.", "Es una página para tu local, con la carta, los horarios y el contacto directo, sin comisiones."]),
  ...pool("propuesta-corta-gastronomia-ustedes", { verticals: GASTRONOMIA, commercialProfiles: USTEDES }, ["La idea es que el local tenga su página con carta y horarios, y que los clientes los contacten directo.", "Es una página para el local, con la carta, los horarios y el contacto directo, sin comisiones."]),
  ...pool("propuesta-corta-experiencias-vos", { verticals: EXPERIENCIAS, commercialProfiles: VOS }, ["La idea es que tu experiencia aparezca cuando el turista decide qué hacer en la zona, con contacto directo y sin comisiones.", "La propuesta es una ficha para tu salida, con contacto directo con el turista y sin comisiones."]),
  ...pool("propuesta-corta-experiencias-ustedes", { verticals: EXPERIENCIAS, commercialProfiles: USTEDES }, ["La idea es que la experiencia aparezca cuando el turista decide qué hacer en la zona, con contacto directo y sin comisiones.", "La propuesta es una ficha para la salida, con contacto directo con el turista y sin comisiones."]),
];

/** Follows a bold "Para probarlo:" label, so it starts in lowercase. */
const pruebaGratis = pool("prueba", {}, ["los primeros 30 días son gratis y no se pide tarjeta.", "hay 30 días de prueba sin costo y sin tarjeta.", "son 30 días gratis, sin cargar tarjeta."]);

/** Follows a bold "Nos ocupamos de la carga:" label, so it starts in lowercase. */
const ayudaFicha = [
  ...pool("ayuda-vos", { commercialProfiles: VOS }, ["nos pasás fotos y datos, armamos la ficha y vos solo creás la cuenta.", "con las fotos y los datos que nos mandes dejamos la ficha lista; solo hace falta que crees la cuenta.", "si querés, armamos la ficha con tu material y vos solo creás la cuenta."]),
  ...pool("ayuda-ustedes", { commercialProfiles: USTEDES }, ["nos pasan fotos y datos, armamos la ficha y ustedes solo crean la cuenta.", "con las fotos y los datos que nos manden dejamos la ficha lista; solo hace falta que creen la cuenta.", "si quieren, armamos la ficha con su material y ustedes solo crean la cuenta."]),
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

const propuestaAliados = pool("aliados", {}, [
  "El programa de aliados de Hospeda está pensado para marcas y empresas que buscan acompañar el turismo del Litoral con una presencia estable.",
  "Estamos sumando aliados: marcas y empresas interesadas en estar presentes donde se planifica el viaje por el Litoral.",
]);
const propuestaProveedores = pool("proveedores", {}, [
  "Estamos armando un directorio de proveedores para los anfitriones de Hospeda: servicios de confianza cerca de sus alojamientos.",
  "Los anfitriones de Hospeda buscan servicios de confianza en la zona, y estamos armando un directorio de proveedores para ellos.",
]);
const propuestaEditores = pool("editores", {}, [
  "Buscamos personas que conozcan la región para escribir notas o cargar eventos en la agenda de Hospeda.",
  "Estamos sumando editores que quieran contar el Litoral: notas, eventos y recomendaciones en Hospeda.",
]);

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
  text("ref_ciudad", "Referencia a la ciudad", "Cierra una frase del email con la localidad; los 22 destinos de Hospeda tienen frases propias.", refCiudad),
  text("etapa_hospeda", "Etapa de Hospeda", "Para email: explica con honestidad que Hospeda recién arranca y tiene poco tráfico.", etapaHospeda),
  text("etapa_corta", "Etapa de Hospeda (corta)", "Para WhatsApp e Instagram: una línea sobre la etapa de Hospeda.", etapaCorta),
  text("propuesta_valor", "Propuesta de valor", "Para email: qué tendría el negocio según su rubro y perfil.", propuestaValor),
  text("propuesta_corta", "Propuesta de valor (corta)", "Para WhatsApp e Instagram: la propuesta en una línea.", propuestaCorta),
  text("prueba_gratis", "Prueba gratis", "Los 30 días de prueba sin tarjeta (va después de «Para probarlo:»).", pruebaGratis),
  text("ayuda_ficha", "Ayuda con la ficha", "Ofrece armar la ficha con el material del negocio (va después de «Nos ocupamos de la carga:»).", ayudaFicha),
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
