import { sql, type RawBuilder } from 'kysely';
import { phoneNationalKeys, phoneSignificantKeys } from './dataNormalization';

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

const MAX_TOKENS = 5;
const MIN_PHONE_DIGITS = 6;
/** Whitespace-separated search words (at most 5); an empty or blank query yields no tokens. */
export function searchTokens(query: string): string[] {
  return query.trim().split(/\s+/u).filter(Boolean).slice(0, MAX_TOKENS);
}

/**
 * Matches a phone column against what the user typed regardless of format (spaces, dashes, +54, 9, 0, 15).
 * Returns null unless the query looks like a phone number (only digits and phone punctuation, 6+ digits), so callers can skip it.
 * Reuses the same Argentine normalization as duplicate detection: last 8 significant digits, with a "15" local prefix tolerated in the stored value.
 */
export function phoneSearchSql(column: string, query: string): RawBuilder<boolean> | null {
  const text = query.trim();
  if (!/^\+?[\d\s().-]+$/u.test(text)) return null;
  const digits = text.replace(/\D/g, '');
  if (digits.length < MIN_PHONE_DIGITS) return null;
  const stored = sql<string>`translate(coalesce(${sql.ref(column)}, ''), translate(coalesce(${sql.ref(column)}, ''), '0123456789', ''), '')`;
  // A typed fragment of the stored digits, or the same number written in another format (compared by its last 8 digits).
  const parts = [sql<boolean>`${stored} like ${'%' + digits + '%'}`];
  for (const key of new Set(phoneSignificantKeys(text))) parts.push(sql<boolean>`right(${stored}, 8) = ${key}`);
  // The same number stored with the local "15" after the area code (area lengths 2 to 4): compared by suffix, with no per-row regex.
  for (const national of new Set(phoneNationalKeys(text))) for (const area of [2, 3, 4]) parts.push(sql<boolean>`${stored} like ${'%' + national.slice(0, area) + '15' + national.slice(area)}`);
  return sql<boolean>`(${sql.join(parts, sql` or `)})`;
}

/**
 * Multi-word search: every word (max 5) must match at least one column (AND across words, OR across columns),
 * so "hotel colon" finds "Hotel X" in "Colón". Accent-insensitive with ñ distinct from n.
 * A query that is a phone number also matches `phoneColumns` in any phone format. `extra` adds per-word alternatives (e.g. notes).
 */
export function multiFieldSearchSql(columns: readonly string[], query: string, options: { phoneColumns?: readonly string[]; extra?: (token: string) => RawBuilder<boolean> } = {}): RawBuilder<boolean> {
  const { phoneColumns = [], extra } = options;
  const perToken = (token: string) => sql<boolean>`(${sql.join([...columns.map(c => searchSql(c, token)), ...phoneColumns.map(c => phoneSearchSql(c, token)).filter((p): p is RawBuilder<boolean> => p !== null), ...(extra ? [extra(token)] : [])], sql` or `)})`;
  // A query that is just a phone number is matched as one piece (digit groups are not separate words), which also keeps it to a single pass over the text columns.
  const whole = phoneColumns.map(c => phoneSearchSql(c, query)).filter((p): p is RawBuilder<boolean> => p !== null);
  if (whole.length) return sql<boolean>`(${sql.join([...columns.map(c => searchSql(c, query.trim())), ...whole], sql` or `)})`;
  const tokens = searchTokens(query);
  return tokens.length ? sql<boolean>`(${sql.join(tokens.map(perToken), sql` and `)})` : sql<boolean>`false`;
}
