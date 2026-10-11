import { describe, expect, it } from 'vitest';
import { fuzzySearchScore, normalizeSearchText } from './searchText';

describe('search equivalence', () => {
  it.each(['concepcion', 'Concepcion', 'CONCEPCIÓN', 'Concepcio\u0301n'])('matches %s without rewriting the original', query => {
    const original = 'Concepción';
    expect(normalizeSearchText(original)).toBe(normalizeSearchText(query));
    expect(original).toBe('Concepción');
  });
  it('handles blank input and accented vowels', () => {
    expect(normalizeSearchText('  ')).toBe('');
    expect(normalizeSearchText(' ÁÉÍÓÚÜ ')).toBe('aeiouu');
  });
  it('preserves ñ as a distinct letter, including decomposed Unicode', () => {
    expect(normalizeSearchText('Ñ')).toBe(normalizeSearchText('n\u0303'));
    expect(normalizeSearchText('caña')).not.toBe(normalizeSearchText('cana'));
  });
});

describe('fuzzy help search',()=>{
  it('matches small typing mistakes and ranks exact matches first',()=>{
    expect(fuzzySearchScore('negosios precargados','Revisar negocios precargados')).not.toBeNull();
    expect(fuzzySearchScore('cerrar venta','Cómo cerrar una venta')).not.toBeNull();
    expect(fuzzySearchScore('cerrar venta','Registrar una actividad')).toBeNull();
  });
  it('keeps n and ñ distinct',()=>{
    expect(fuzzySearchScore('cana','caña')).toBeNull();
  });
});
