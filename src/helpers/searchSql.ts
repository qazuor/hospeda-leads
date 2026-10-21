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

/** The search pieces of a query, as in multiFieldSearchSql: the whole trimmed query when it is a phone number and phones are searched (digit groups are not separate words), otherwise its words. */
function searchPieces(query: string, phoneAware: boolean): string[] {
  return phoneAware && phoneSearchSql('phone', query) ? [query.trim()] : searchTokens(query);
}
/** Whether pg_trgm can extract a trigram from `%piece%` (a run of 3 letters or digits); only then can an index narrow the rows. */
function trigramPiece(piece: string): boolean {
  return /[\p{L}\p{N}]{3}/u.test(piece.normalize('NFC'));
}
/** Text columns OR phone columns matching one search piece; `false` when nothing applies. */
function anyColumnSql(columns: readonly string[], phoneColumns: readonly string[], piece: string): RawBuilder<boolean> {
  const parts = [...columns.map(c => searchSql(c, piece)), ...phoneColumns.map(c => phoneSearchSql(c, piece)).filter((p): p is RawBuilder<boolean> => p !== null)];
  return parts.length ? sql<boolean>`(${sql.join(parts, sql` or `)})` : sql<boolean>`false`;
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
  if (whole.length) return sql<boolean>`(${sql.join([...columns.map(c => searchSql(c, query.trim())), ...(extra ? [extra(query.trim())] : []), ...whole], sql` or `)})`;
  const tokens = searchTokens(query);
  return tokens.length ? sql<boolean>`(${sql.join(tokens.map(perToken), sql` and `)})` : sql<boolean>`false`;
}

/**
 * One table a joined search can match, read on its own so its trigram index applies.
 * The outer `key` is compared against `select <id> from <from> where <where> and <any column matches>`.
 */
export interface SearchIdSource {
  /** Outer column holding the id, e.g. `l.account_id`. */
  readonly key: string;
  /** FROM clause of the id subquery, with its own aliases (never the outer query's). */
  readonly from: RawBuilder<unknown>;
  /** Id column the subquery returns, e.g. `s.id`. */
  readonly id: string;
  /** Text columns of `from` searched like multiFieldSearchSql columns. */
  readonly columns: readonly string[];
  /** Columns also matched as phone numbers. */
  readonly phoneColumns?: readonly string[];
  /** Extra condition of the subquery, e.g. a guard that reproduces a coalesce of the outer projection. */
  readonly where?: RawBuilder<boolean>;
}

/**
 * Same matching as multiFieldSearchSql (words ANDed, alternatives ORed, whole-query phone matching), but each
 * alternative is a per-table id set: `key in (select id from table where <expr> like ...)`. A search that ORs
 * columns of joined tables can then use each table's trigram index (migrations 032 and 034) instead of normalizing
 * every joined row. Callers must express each joined column as a source whose ids select exactly the outer rows
 * where that column matches.
 * Each id set is a MATERIALIZED CTE inside the IN, so it is planned on its own: as a plain IN subquery inside the OR
 * the planner chose a sequential scan that normalizes every row (measured on the synthetic dataset, PostgreSQL 17).
 */
export function idSetSearchSql(sources: readonly SearchIdSource[], query: string): RawBuilder<boolean> {
  const pieces = searchPieces(query, sources.some(source => (source.phoneColumns?.length ?? 0) > 0));
  const subquery = (source: SearchIdSource, piece: string, correlated: boolean) => sql`from ${source.from} where ${correlated ? sql`${sql.ref(source.id)} = ${sql.ref(source.key)} and ` : sql``}${source.where ? sql`${source.where} and ` : sql``}${anyColumnSql(source.columns, source.phoneColumns ?? [], piece)}`;
  // A piece without a trigram (no run of 3 letters or digits, e.g. "12") cannot use the index: reading a whole table for it
  // costs more than checking only the rows the other words kept, so it is matched per row (correlated) and ANDed last.
  const perPiece = (piece: string) => trigramPiece(piece)
    ? sql<boolean>`(${sql.join(sources.map(source => sql<boolean>`${sql.ref(source.key)} in (with ids as materialized (select ${sql.ref(source.id)} as id ${subquery(source, piece, false)}) select id from ids)`), sql` or `)})`
    // OFFSET 0 keeps the EXISTS correlated: otherwise the planner turns it into a hashed scan of the whole table again.
    : sql<boolean>`(${sql.join(sources.map(source => sql<boolean>`exists (select 1 ${subquery(source, piece, true)} offset 0)`), sql` or `)})`;
  const ordered = [...pieces.filter(trigramPiece), ...pieces.filter(piece => !trigramPiece(piece))];
  return ordered.length ? sql<boolean>`(${sql.join(ordered.map(perPiece), sql` and `)})` : sql<boolean>`false`;
}
