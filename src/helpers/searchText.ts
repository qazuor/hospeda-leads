/** Search equivalence only: keep stored text and the distinct Spanish letter ñ. */
export function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase('es').normalize('NFD')
    .replace(/\p{M}/gu, mark => mark === '\u0303' ? mark : '')
    .normalize('NFC');
}
