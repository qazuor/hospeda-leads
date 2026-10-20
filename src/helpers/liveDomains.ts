/** Query key prefixes refreshed by live mode, in invalidation order. */
export const LIVE_QUERY_KEYS=[
  "communication","resources","data-quality","pipeline","work","commercial","commercial-detail","leads","lead-stats","settings","analytics","lead-duplicates","lead-notes",
  "lead-journal","global-journal","global-journal-filtered","trash-leads"
] as const;
export type LiveQueryKey=typeof LIVE_QUERY_KEYS[number];

/**
 * Query key prefixes whose server data reads tables of each live domain (see migration 026).
 * A domain lists every key whose endpoint reads one of its tables, so a narrower list must be
 * justified by the endpoint code, not by the page that usually shows the data.
 */
export const LIVE_DOMAIN_QUERY_KEYS:Readonly<Record<string,readonly LiveQueryKey[]>>={
  business:LIVE_QUERY_KEYS.filter(key=>key!=="settings"),
  work:["work"],
  communication:["communication","resources","data-quality","commercial-detail","settings","lead-journal","global-journal","global-journal-filtered"],
  catalog:LIVE_QUERY_KEYS,
  journal:["data-quality","commercial-detail","analytics","lead-journal","global-journal","global-journal-filtered"],
};

/** Live version snapshot returned by `/_api/live_version`; `domains` is absent on servers before migration 026. */
export type LiveSnapshot={version:string;domains?:Readonly<Record<string,string>>};

/**
 * Returns the query key prefixes to invalidate after a live check.
 * No previous snapshot → nothing. Missing domains, unknown domains, or a legacy-only change → every live key.
 */
export function liveQueryKeysToInvalidate({previous,next}:{previous:LiveSnapshot|null;next:LiveSnapshot}):readonly LiveQueryKey[]{
  if(!previous)return [];
  if(!previous.domains||!next.domains)return previous.version===next.version?[]:LIVE_QUERY_KEYS;
  const before=previous.domains,after=next.domains;
  const changed=[...new Set([...Object.keys(before),...Object.keys(after)])].filter(domain=>before[domain]!==after[domain]);
  if(changed.length===0)return previous.version===next.version?[]:LIVE_QUERY_KEYS;
  if(changed.some(domain=>!Object.hasOwn(LIVE_DOMAIN_QUERY_KEYS,domain)))return LIVE_QUERY_KEYS;
  const keys=new Set(changed.flatMap(domain=>LIVE_DOMAIN_QUERY_KEYS[domain]));
  return LIVE_QUERY_KEYS.filter(key=>keys.has(key));
}
