/**
 * Presence heartbeats (`/_api/presence/*`) are background telemetry, not business writes. Tests that assert "opening this screen writes nothing"
 * exclude them so the invariant keeps meaning "no business data changed".
 */
export function isPresenceRequest(url:string):boolean{return new URL(url).pathname.startsWith('/_api/presence/');}
