import { afterEach, describe, expect, it, vi } from 'vitest';
import { MESSAGE_CATALOG_CITIES, MESSAGE_CATALOG_VARIABLES } from './messageCatalogVariables';
import { MESSAGE_CATALOG_TEMPLATES } from './messageCatalogTemplates';
import { buildMessageCatalogMigration } from './messageCatalogMigration';
import { validateMessageVariables, resolveMessageVariables, DEFAULT_MESSAGE_VARIABLES } from '../helpers/messageVariables';
import { buildMessageTemplateContext } from '../helpers/messageTemplateContext';
import { htmlToPlainText, renderMessageTemplate } from '../helpers/renderMessageTemplate';
import { templateCompatibility } from '../helpers/messageTemplatePolicy';

const PROFILES = ['Independiente', 'Consolidado', 'Referente', null] as const;
const USTEDES = new Set(['Consolidado', 'Referente']);
// Argentina is UTC-3: 12:00Z = 09:00, 18:00Z = 15:00, 23:30Z = 20:30 local.
const MOMENTS = ['2027-01-15T12:00:00Z', '2027-07-14T18:00:00Z', '2027-04-21T23:30:00Z', '2026-10-23T18:00:00Z'];
const VOS_MARKERS = /\b(tenés|querés|podés|pasás|creás|cargues|pudiste|tu|tus|te)\b/i;
const USTEDES_MARKERS = /\b(les|ustedes|tienen|pueden|quieren|pudieron|carguen)\b/i;

const render = (template: (typeof MESSAGE_CATALOG_TEMPLATES)[number], { profile, contact, city, type, accountId = 7, variation = 0 }: { profile: string | null; contact: string; city: string; type: string; accountId?: number; variation?: number }) => {
  const context = buildMessageTemplateContext({ accountId, contactId: contact ? 3 : null, name: 'Cabañas del Río', contact, city, type, sender: 'Leandro Pérez', senderShort: 'Leo', senderEmail: 'leo@hospeda.com.ar', managementType: template.managementType, commercialProfile: profile, channel: template.channel, purpose: template.purpose, variation });
  return { subject: template.subject ? renderMessageTemplate(template.subject, context) : '', body: htmlToPlainText(renderMessageTemplate(template.body, context)) };
};

afterEach(() => { vi.useRealTimers(); });

describe('message catalog', () => {
  it('is valid for the settings validator and is the built-in default', () => {
    expect(validateMessageVariables(MESSAGE_CATALOG_VARIABLES).map(variable => variable.key)).toEqual(MESSAGE_CATALOG_VARIABLES.map(variable => variable.key));
    expect(DEFAULT_MESSAGE_VARIABLES).toBe(MESSAGE_CATALOG_VARIABLES);
  });

  it('covers every purpose with Email, WhatsApp and Instagram and keeps names unique per channel', () => {
    for (const channel of ['email', 'whatsapp', 'social']) {
      const names = MESSAGE_CATALOG_TEMPLATES.filter(template => template.channel === channel).map(template => template.name);
      expect(new Set(names).size).toBe(names.length);
    }
    expect(new Set(MESSAGE_CATALOG_TEMPLATES.map(template => template.purpose))).toEqual(new Set(['verification', 'first_contact', 'resume', 'care', 'operations']));
    expect(MESSAGE_CATALOG_TEMPLATES.filter(template => template.channel === 'email').every(template => template.subject)).toBe(true);
    expect(MESSAGE_CATALOG_TEMPLATES.filter(template => template.channel !== 'email').every(template => template.subject === null)).toBe(true);
    for (const name of ['Bienvenida', 'Revisión de la ficha', 'Fin de la prueba']) {
      expect(MESSAGE_CATALOG_TEMPLATES.filter(template => template.name.startsWith(`${name} ·`)).map(template => template.channel)).toEqual(['email', 'whatsapp']);
    }
    for (const managementType of ['main', 'provider', 'partner']) {
        expect(MESSAGE_CATALOG_TEMPLATES.filter(template => template.name.startsWith('Envío de la información') && template.managementType === managementType)).toHaveLength(managementType === 'main' ? 12 : 3);
    }
  });

  it('renders every template without leftovers in every profile, time, city and rubro', () => {
    vi.useFakeTimers();
    for (const moment of MOMENTS) {
      vi.setSystemTime(new Date(moment));
      for (const template of MESSAGE_CATALOG_TEMPLATES) for (const profile of PROFILES) for (const contact of ['Ana María', '']) for (const city of ['Colón', 'Paraná', '']) for (const type of ['Alojamientos', 'Gastronomía', 'Experiencia', 'Rubro nuevo']) {
        const { subject, body } = render(template, { profile, contact, city, type });
        const where = `${template.name} · ${profile} · ${contact || 'sin nombre'} · ${city || 'sin ciudad'} · ${type} · ${moment}`;
        for (const textValue of [subject, body]) {
          expect(textValue, where).not.toMatch(/{{|}}|undefined|null/);
          expect(textValue, where).not.toMatch(/ {2,}| [,.:?!]|\(\)|, ,/);
        }
        expect(body.length, where).toBeGreaterThan(80);
        // Chats must be read at a glance, not skipped: short, and a cold first contact carries no links.
        if (template.channel !== 'email') expect(body.length, where).toBeLessThan(template.purpose === 'operations' ? 500 : 450);
        if (template.channel !== 'email' && template.purpose === 'first_contact') expect(body, where).not.toMatch(/https?:/);
        if (contact) expect(body, where).not.toContain('María');
        expect(body, where).not.toMatch(USTEDES.has(profile ?? '') ? VOS_MARKERS : USTEDES_MARKERS);
      }
    }
  }, 60_000);

  it('only explains what Hospeda is in the first message to a business', () => {
    for (const template of MESSAGE_CATALOG_TEMPLATES) {
      const first = template.purpose === 'verification' || template.purpose === 'first_contact';
      expect(template.body.includes('{{presentacion}}'), template.name).toBe(first);
      if (template.name.startsWith('Seguimiento ·') || template.name.startsWith('Último seguimiento ·') || template.name.startsWith('Bienvenida ·') || template.name.startsWith('Fin de la prueba ·')) expect(template.body.includes('{{presentacion_breve}}'), template.name).toBe(true);
      if (!first) expect(render(template, { profile: 'Independiente', contact: 'Ana', city: 'Colón', type: 'Alojamientos' }).body, template.name).not.toMatch(/plataforma|Litoral/);
    }
  });

  it('never offers to build the listing in a first contact or information delivery template', () => {
    for (const template of MESSAGE_CATALOG_TEMPLATES) {
      if (template.purpose === 'first_contact' || template.name.startsWith('Envío de la información')) {
        expect(template.body, template.name).not.toMatch(/armamos la ficha/i);
        for (const profile of PROFILES) {
          expect(render(template, { profile, contact: 'Ana', city: 'Colón', type: 'Alojamientos' }).body, `${template.name} · ${profile}`).not.toMatch(/armamos la ficha/i);
        }
      }
    }
  });

  it('renders every template with person-specific variables in one consistent register', () => {
    const vos = /\b(?:te|tu|tus|tenés|querés|podés|escribime|registrás|creás|necesitás|sumarte)\b/i;
    const ustedes = /\b(?:ustedes|escríbanme|registran|crean|necesitan|tienen|quieren|les (?:cuento|interesa|paso|cuente)|su cuenta)\b/i;
    for (const template of MESSAGE_CATALOG_TEMPLATES) for (const profile of PROFILES) {
      const body = render(template, { profile, contact: 'Ana', city: 'Colón', type: 'Alojamientos' }).body;
      expect(body, `${template.name} · ${profile ?? 'none'}`).not.toMatch(USTEDES.has(profile ?? '') ? vos : ustedes);
    }
  });

  it('keeps destination phrases out of the opening and chats', () => {
    for (const template of MESSAGE_CATALOG_TEMPLATES) {
      if (template.channel !== 'email') expect(template.body, template.name).not.toContain('{{ref_ciudad}}');
      expect(template.body, template.name).not.toMatch(/{{name}}[^.]*{{ref_ciudad}}/);
    }
  });

  it('never talks as if the business were already in Hospeda in a first contact', () => {
    const propuesta = MESSAGE_CATALOG_VARIABLES.filter(variable => ['propuesta_valor', 'propuesta_corta'].includes(variable.key)).flatMap(variable => variable.alternatives.map(alternative => alternative.text));
    for (const value of propuesta) expect(value).not.toMatch(/^(Tu|El|La) (negocio|alojamiento|local|experiencia) tiene\b/);
  });

  it('never uses retired vocabulary, prices or promises of results', () => {
    // URLs are the public site's paths (e.g. /suscriptores/planes/), not copy: the rule checks only the wording.
    const all = JSON.stringify([MESSAGE_CATALOG_TEMPLATES, MESSAGE_CATALOG_VARIABLES]).replace(/https?:\/\/[^\s"<]+/g, '');
    expect(all).not.toMatch(/\b(lead|leads|oportunidad|Filtrado|Suscripto|garantiz|asegur[aá]mos|\$\s?\d)/i);
  });

  it('gives each of the 22 Hospeda destinations its own reference and other cities the generic one', () => {
    expect(MESSAGE_CATALOG_CITIES).toHaveLength(22);
    for (const city of MESSAGE_CATALOG_CITIES) expect(resolveMessageVariables({ city, __seed: 's' }).ref_ciudad).not.toBe(`en ${city}`);
    expect(resolveMessageVariables({ city: 'Paraná', __seed: 's' }).ref_ciudad).toBe('en Paraná');
    expect(resolveMessageVariables({ city: 'colon', __seed: 's' }).ref_ciudad).toContain('Colón');
  });

  it('varies the first contact between businesses and with Otra redacción', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-22T13:00:00Z'));
    const template = MESSAGE_CATALOG_TEMPLATES.find(item => item.purpose === 'first_contact' && item.managementType === 'main' && item.channel === 'whatsapp')!;
    const texts = new Set(Array.from({ length: 30 }, (_, index) => render(template, { profile: 'Independiente', contact: 'Ana', city: 'Colón', type: 'Alojamientos', accountId: index + 1 }).body));
    expect(texts.size).toBeGreaterThanOrEqual(20);
    const first = render(template, { profile: 'Independiente', contact: 'Ana', city: 'Colón', type: 'Alojamientos' }).body;
    expect(render(template, { profile: 'Independiente', contact: 'Ana', city: 'Colón', type: 'Alojamientos' }).body).toBe(first);
    expect(new Set([0, 1, 2, 3].map(variation => render(template, { profile: 'Independiente', contact: 'Ana', city: 'Colón', type: 'Alojamientos', variation }).body)).size).toBeGreaterThan(1);
  });

  it('only offers each template for its own purpose and management type', () => {
    const verification = MESSAGE_CATALOG_TEMPLATES.filter(template => templateCompatibility({ ...template, vertical: null, commercialProfile: null }, { channel: 'whatsapp', purpose: 'verification' }) === null);
    expect(verification.map(template => template.name)).toEqual(['Verificación del negocio · WhatsApp']);
    const partner = MESSAGE_CATALOG_TEMPLATES.filter(template => templateCompatibility({ ...template, vertical: null, commercialProfile: null }, { channel: 'email', purpose: 'first_contact', managementType: 'partner' }) === null);
    expect(partner.map(template => template.name)).toEqual(['Primer contacto · Aliados · Email']);
  });

  it('builds migration rows with vertical targeting without writing a migration artifact', () => {
    const sql = buildMessageCatalogMigration().sql;
    expect(MESSAGE_CATALOG_TEMPLATES).toHaveLength(48);
    expect(sql).toContain('message_templates(channel,name,subject,body,management_type,purpose,vertical)');
    expect(sql).toContain("'main','resume','Alojamientos'");
    expect(sql).toContain('Falta el material activo «%». Cargalo con ese título exacto antes de desplegar.');
    expect(sql).toContain('Hay % materiales activos con el título «%». Dejá uno solo activo antes de desplegar.');
    expect(sql).toContain("'Presentación corta · Alojamientos'");
    expect(sql).toContain("'Presentación corta · Comer y salir'");
    expect(sql).toContain("'Presentación corta · Experiencias'");
    expect(sql).toContain("'Cómo funciona Hospeda'");
    expect(sql).toContain("'3 formas de estar en Hospeda'");
    expect(sql).toContain('IF NOT EXISTS (SELECT 1 FROM crm_sales_materials WHERE status=');
    expect(sql).not.toContain('ORDER BY created_at LIMIT 1');
    expect(sql.split('\n')[0]).toContain('v4');
    expect(sql.match(/INSERT INTO message_templates/g)).toHaveLength(1);
  });
});
