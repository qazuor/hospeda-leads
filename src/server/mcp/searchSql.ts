/** Shared PostgreSQL text match: NFD accents fold while U+0303 remains, so ñ stays distinct from n. */
export function normalizedTextMatchSql(value:string,term:string):string{
 const accents='[\\u0300-\\u0302\\u0304-\\u036f]';
 return `normalize(regexp_replace(normalize(lower(coalesce(${value},'')),NFD),'${accents}','','g'),NFC) LIKE '%'||normalize(regexp_replace(normalize(lower(${term}),NFD),'${accents}','','g'),NFC)||'%'`;
}
export function normalizedWordMatchSql(value:string,term:string):string{
 const accents='[\\u0300-\\u0302\\u0304-\\u036f]';
 return `normalize(regexp_replace(normalize(lower(coalesce(${value},'')),NFD),'${accents}','','g'),NFC) ~ '(^|[^[:alnum:]_])${term.replaceAll("'","''")}($|[^[:alnum:]_])'`;
}
