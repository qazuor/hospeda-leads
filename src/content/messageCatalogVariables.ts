import { HOSPEDA_PHONE } from "../helpers/hospedaEmailLayout";
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
  ...pool("presentacion-whatsapp", { channel: "whatsapp" }, ["Soy {{sender_short}}, de Hospeda (hospeda.com.ar), una plataforma turística del Litoral que acaba de arrancar.", "Soy {{sender_short}}, del equipo de Hospeda (hospeda.com.ar), la nueva plataforma turística del Litoral.", "Mi nombre es {{sender_short}}, de Hospeda (hospeda.com.ar), una plataforma turística nueva del Litoral."]),
  ...pool("presentacion-social", { channel: "social" }, ["Soy {{sender_short}}, de Hospeda (hospeda.com.ar), una plataforma turística del Litoral que acaba de arrancar.", "Acá {{sender_short}}, del equipo de Hospeda (hospeda.com.ar), la nueva plataforma turística del Litoral.", "Mi nombre es {{sender_short}}, de Hospeda (hospeda.com.ar), una plataforma turística nueva del Litoral."]),
];

/** Short self-introduction for follow-ups (resume, news, care, operations): no description of Hospeda. */
const presentacionBreve = [
  ...pool("presentacion-breve-email", { channel: "email" }, ["Soy {{sender}}, de Hospeda.", "Soy {{sender}}, del equipo de Hospeda."]),
  ...pool("presentacion-breve-whatsapp", { channel: "whatsapp" }, ["Soy {{sender_short}}, de Hospeda.", "Acá {{sender_short}}, de Hospeda.", "Soy {{sender_short}}, del equipo de Hospeda."]),
  ...pool("presentacion-breve-social", { channel: "social" }, ["Soy {{sender_short}}, de Hospeda.", "Acá {{sender_short}}, de Hospeda.", "Soy {{sender_short}}, del equipo de Hospeda."]),
];

const queEsHospeda = pool("que-es-hospeda", {}, [
  "Hospeda, la nueva plataforma turística integral del Litoral",
  "Hospeda, una plataforma turística del Litoral que recién arranca y reúne alojamientos, gastronomía y experiencias",
  "Hospeda, una plataforma turística nueva del Litoral, pensada para que los viajeros planifiquen su visita",
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
  "Hospeda ya está en línea, pero recién arranca y el tráfico todavía es bajo. Por eso hoy el foco está en sumar alojamientos, gastronomía y experiencias: la meta es que en poco tiempo sea la referencia turística de la región, y los primeros negocios en sumarse son los que más se van a ver.",
  "La plataforma está en línea hace poco y todavía tiene pocas visitas. Estamos sumando a los primeros negocios turísticos de la región, con la idea de que en breve Hospeda sea el lugar donde se planifica el viaje por el Litoral.",
  "Estamos dando los primeros pasos: el sitio ya está en línea y estamos sumando la oferta turística de la zona. El objetivo es convertirnos pronto en la referencia de la región, y mientras más negocios se sumen, más rápido crecen las visitas.",
]);
/** One-line version of the stage for WhatsApp and Instagram. */
const etapaCorta = pool("etapa-corta", {}, [
  "Estamos arrancando, y la idea es que en poco tiempo sea la referencia para quien viaja por la región.",
  "Recién empezamos, con el objetivo de ser pronto la guía turística de referencia del Litoral.",
  "Estamos sumando a los primeros negocios de la zona para ser pronto la referencia turística de la región.",
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
const pruebaGratis = pool("prueba", {}, ["los primeros 30 días son sin costo y no se pide tarjeta.", "hay 30 días de prueba sin costo y sin tarjeta.", "son 30 días sin costo, sin cargar tarjeta."]);
/** The hook of the chat first contact: the trial, without the word "gratis" (it reads as spam in a cold message). */
const pruebaCorta = pool("prueba-corta", {}, ["Hay 30 días de prueba sin costo.", "Se puede probar 30 días sin costo.", "La prueba es de 30 días, sin costo."]);

/** Follows a bold "Nos ocupamos de la carga:" label, so it starts in lowercase. */
const ctaRegistro = [
  ...pool("cta-registro-vos", { commercialProfiles: VOS }, ["Para sumarte, te registrás en {{link_registro}} y creás la ficha desde tu cuenta.", "El primer paso es registrarte en {{link_registro}} y crear la ficha desde tu cuenta."]),
  ...pool("cta-registro-ustedes", { commercialProfiles: USTEDES }, ["Para sumarse, se registran en {{link_registro}} y crean la ficha desde su cuenta.", "El primer paso es registrarse en {{link_registro}} y crear la ficha desde su cuenta."]),
];
const ofrecerAyuda = [
  ...pool("ofrecer-ayuda-vos", { commercialProfiles: VOS }, ["Si en algún paso te trabás, escribime y lo vemos.", "Cualquier duda en el camino, escribime por acá."]),
  ...pool("ofrecer-ayuda-ustedes", { commercialProfiles: USTEDES }, ["Si en algún paso se traban, escríbanme y lo vemos.", "Cualquier duda en el camino, me escriben por acá."]),
];
const pasoFicha = [
  ...pool("paso-ficha-vos", { commercialProfiles: VOS }, ["El siguiente paso es crear la ficha desde tu cuenta: la prueba de 30 días empieza cuando se publica."]),
  ...pool("paso-ficha-ustedes", { commercialProfiles: USTEDES }, ["El siguiente paso es crear la ficha desde su cuenta: la prueba de 30 días empieza cuando se publica."]),
];
const ofertaArmado = [
  ...pool("oferta-armado-vos", { commercialProfiles: VOS }, ["Tranqui, si te resulta más fácil, la ficha la armamos nosotros. Solo necesitás registrarte en {{link_registro}} y pasarnos por acá:"]),
  ...pool("oferta-armado-ustedes", { commercialProfiles: USTEDES }, ["Tranquilos, si les resulta más fácil, la ficha la armamos nosotros. Solo necesitan registrarse en {{link_registro}} y pasarnos por acá:"]),
];
const preguntaCharla = [
  ...pool("pregunta-charla-vos", { commercialProfiles: VOS }, ["¿Qué día te queda cómodo?", "¿Cuándo te viene bien?"]),
  ...pool("pregunta-charla-ustedes", { commercialProfiles: USTEDES }, ["¿Qué día les queda cómodo?", "¿Cuándo les viene bien?"]),
];

const temporada = [
  ...pool("temporada-verano", { months: [12, 1, 2] }, ["Con la temporada de verano en marcha, es un buen momento para estar en Hospeda.", "Ahora que arrancó la temporada de verano, es un buen momento para tener la ficha publicada."]),
  ...pool("temporada-previa-verano", { months: [10, 11] }, ["Con la temporada de verano cerca, es un buen momento para sumarse.", "Pensando en el verano que se viene, es un buen momento para estar en Hospeda."]),
  ...pool("temporada-invierno", { months: [6, 7] }, ["Pensando en las vacaciones de invierno, es un buen momento para sumarse."]),
];

const BASE = "https://hospeda.com.ar/es/presentacion";
/** Plans or publishing page per rubro, verified on the public site (02/11/2026). */
const linkPlanes = [
  ...pool("planes-general", {}, ["https://hospeda.com.ar/es/suscriptores/planes/"]),
  ...pool("planes-alojamientos", { verticals: ALOJAMIENTOS }, ["https://hospeda.com.ar/es/planes/anfitriones/"]),
  ...pool("planes-gastronomia", { verticals: GASTRONOMIA }, ["https://hospeda.com.ar/es/publicar/comer-y-salir/"]),
  ...pool("planes-experiencias", { verticals: EXPERIENCIAS }, ["https://hospeda.com.ar/es/publicar/experiencias/"]),
];
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
  ...pool("pregunta-presentacion-vos", { commercialProfiles: VOS }, ["¿Te cuento cómo funciona?", "¿Te interesa que te cuente un poco más?", "¿Te paso más información?"]),
  ...pool("pregunta-presentacion-ustedes", { commercialProfiles: USTEDES }, ["¿Les cuento cómo funciona?", "¿Les interesa que les cuente un poco más?", "¿Les paso más información?"]),
];
const preguntaRetomar = [
  ...pool("pregunta-retomar-vos", { commercialProfiles: VOS }, ["¿Pudiste verlo? Si te sirve, lo charlamos cuando te quede cómodo.", "¿Querés que lo veamos juntos? Te cuento lo que necesites."]),
  ...pool("pregunta-retomar-ustedes", { commercialProfiles: USTEDES }, ["¿Pudieron verlo? Si les sirve, lo charlamos cuando les quede cómodo.", "¿Quieren que lo veamos juntos? Les cuento lo que necesiten."]),
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
  text("presentacion", "Presentación", "Para el primer mensaje (verificación y primer contacto): quién escribe y qué es Hospeda, según el canal.", presentacion),
  text("presentacion_breve", "Presentación breve", "Para mensajes de seguimiento: solo quién escribe, sin volver a explicar Hospeda.", presentacionBreve),
  text("que_es_hospeda", "Qué es Hospeda", "Descripción breve de Hospeda (se usa dentro de la presentación).", queEsHospeda),
  text("ref_ciudad", "Referencia a la ciudad", "Cierra una frase del email con la localidad; los 22 destinos de Hospeda tienen frases propias.", refCiudad),
  text("etapa_hospeda", "Etapa de Hospeda", "Para email: explica con honestidad que Hospeda recién arranca y tiene poco tráfico.", etapaHospeda),
  text("etapa_corta", "Etapa de Hospeda (corta)", "Para WhatsApp e Instagram: una línea sobre la etapa de Hospeda.", etapaCorta),
  text("propuesta_valor", "Propuesta de valor", "Para email: qué tendría el negocio según su rubro y perfil.", propuestaValor),
  text("propuesta_corta", "Propuesta de valor (corta)", "Para WhatsApp e Instagram: la propuesta en una línea.", propuestaCorta),
  text("prueba_gratis", "Prueba gratis", "Los 30 días de prueba sin tarjeta (va después de «Para probarlo:»).", pruebaGratis),
  text("prueba_corta", "Prueba sin costo (corta)", "Para WhatsApp e Instagram: los 30 días de prueba en una línea.", pruebaCorta),
  fixed("link_registro", "Registro en Hospeda", "Página de registro: el negocio crea su cuenta y desde ahí su ficha.", "https://hospeda.com.ar/es/auth/signup/"),
  text("link_planes", "Planes por rubro", "Página de planes o de publicación del rubro del negocio.", linkPlanes),
  fixed("link_faq", "Preguntas frecuentes", "Preguntas frecuentes de Hospeda.", "https://hospeda.com.ar/es/preguntas-frecuentes/"),
  text("cta_registro", "Invitación a registrarse", "Indica que el negocio se registra y crea su ficha desde su propia cuenta.", ctaRegistro),
  text("ofrecer_ayuda", "Ayuda durante el registro", "Ofrece acompañamiento si surge una duda durante el registro o la creación de la ficha.", ofrecerAyuda),
  text("paso_ficha", "Siguiente paso: crear la ficha", "Explica el paso de creación propia y el inicio de la prueba al publicar.", pasoFicha),
  text("oferta_armado", "Armado de ficha de rescate", "Oferta de armado sólo cuando el cliente explica que no entiende cómo hacerlo.", ofertaArmado),
  text("pregunta_charla", "Pregunta para coordinar charla", "Pregunta breve para coordinar una charla sobre el programa de aliados.", preguntaCharla),
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
  fixed("telefono_hospeda", "Teléfono de Hospeda", "Teléfono comercial que usan todos los vendedores.", HOSPEDA_PHONE),
];
