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

/**
 * Live version snapshot returned by `/_api/live_version`; `domains` and `now` are absent on servers before migration 026.
 * Domain values and `now` are epoch seconds from the database clock (`clock_timestamp()`).
 */
export type LiveSnapshot={version:string;domains?:Readonly<Record<string,string>>;now?:string};

/**
 * Returns the query key prefixes to invalidate after a live check.
 * No previous snapshot → nothing. Missing domains, unknown domains, or a legacy-only change → every live key.
 */
/**
 * Database-clock time (epoch ms) of the latest changed domain, or null when it cannot be known
 * (first check, missing or non-numeric domains): callers must then assume the change is newer than any data.
 */
export function liveChangeTime({previous,next}:{previous:LiveSnapshot|null;next:LiveSnapshot}):number|null{
  if(!previous?.domains||!next.domains)return null;
  const before=previous.domains,after=next.domains;
  const changed=Object.keys(after).filter(domain=>before[domain]!==after[domain]).map(domain=>Number(after[domain]));
  if(changed.length===0||changed.some(value=>!Number.isFinite(value)))return null;
  return Math.max(...changed)*1000;
}

/**
 * Converts a database-clock time into the browser clock using the poll that reported it: the offset is taken at the
 * request midpoint, so its error is at most half the round trip. Returns null when the server did not report `now`.
 */
export function toClientTime({serverTime,snapshot,sentAt,receivedAt}:{serverTime:number;snapshot:LiveSnapshot;sentAt:number;receivedAt:number}):number|null{
  const now=Number(snapshot.now);
  if(snapshot.now===undefined||!Number.isFinite(now))return null;
  return serverTime+(sentAt+receivedAt)/2-now*1000;
}

/**
 * Safety margin added on top of the clock conversion error: trigger stamps are taken before COMMIT, so a load that
 * started shortly after the stamp may still have read the previous state.
 */
export const LIVE_FRESH_MARGIN_MS=1500;

/**
 * Browser time after which a load must have started to count as including a change made at `serverTime`
 * (database clock): converted time + half the poll round trip + `LIVE_FRESH_MARGIN_MS`. Null when it cannot be known.
 */
export function liveFreshAfter({serverTime,snapshot,sentAt,receivedAt}:{serverTime:number;snapshot:LiveSnapshot;sentAt:number;receivedAt:number}):number|null{
  const clientTime=toClientTime({serverTime,snapshot,sentAt,receivedAt});
  return clientTime===null?null:clientTime+(receivedAt-sentAt)/2+LIVE_FRESH_MARGIN_MS;
}

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
