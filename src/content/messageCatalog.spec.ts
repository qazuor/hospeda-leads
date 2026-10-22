import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MESSAGE_CATALOG_CITIES, MESSAGE_CATALOG_VARIABLES } from './messageCatalogVariables';
import { MESSAGE_CATALOG_TEMPLATES } from './messageCatalogTemplates';
import { buildMessageCatalogMigration, MESSAGE_CATALOG_MIGRATION } from './messageCatalogMigration';
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
    expect(new Set(MESSAGE_CATALOG_TEMPLATES.map(template => template.purpose))).toEqual(new Set(['verification', 'first_contact', 'resume', 'relationship', 'care', 'operations']));
    expect(MESSAGE_CATALOG_TEMPLATES.filter(template => template.channel === 'email').every(template => template.subject)).toBe(true);
    expect(MESSAGE_CATALOG_TEMPLATES.filter(template => template.channel !== 'email').every(template => template.subject === null)).toBe(true);
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
        if (template.channel !== 'email') expect(body.length, where).toBeLessThan(950);
        if (contact) expect(body, where).not.toContain('María');
        expect(body, where).not.toMatch(USTEDES.has(profile ?? '') ? VOS_MARKERS : USTEDES_MARKERS);
      }
    }
  }, 60_000);

  it('never uses retired vocabulary, prices or promises of results', () => {
    const all = JSON.stringify([MESSAGE_CATALOG_TEMPLATES, MESSAGE_CATALOG_VARIABLES]);
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

  it('matches the committed migration', () => {
    expect(readFileSync(`migrations/${MESSAGE_CATALOG_MIGRATION}`, 'utf8')).toBe(buildMessageCatalogMigration().sql);
  });
});
