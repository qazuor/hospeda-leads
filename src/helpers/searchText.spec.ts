import { describe, expect, it } from 'vitest';
import { normalizeSearchText } from './searchText';

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
