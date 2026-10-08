import { sql, type RawBuilder } from 'kysely';

// Latin combining accents after NFD; retain U+0303 so ñ stays distinct.
// Normalize both operands in PostgreSQL, without rewriting stored text or
// requiring an extension. Parameters and SQL references remain separate.
const accents = '[\u0300-\u0302\u0304-\u036f]';
export function normalizeSearchSql(value: RawBuilder<string>): RawBuilder<string> {
  return sql<string>`normalize(regexp_replace(normalize(lower(coalesce(${value}, '')), NFD), ${accents}, '', 'g'), NFC)`;
}

export function searchSql(column: string, query: string): RawBuilder<boolean> {
  return sql<boolean>`${normalizeSearchSql(sql<string>`${sql.ref(column)}`)} like ${normalizeSearchSql(sql<string>`${'%' + query + '%'}`)}`;
}
