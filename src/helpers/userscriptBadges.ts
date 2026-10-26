const WINDOW_MS=60_000, LIMIT=30;
const requests=new Map<string,number[]>();
/** In-memory per-token sliding window; process-local by design, matching the single API process deployment. */
export function allowBadgeRequest(tokenId:string,now=Date.now()):boolean{for(const [key,times] of requests)if(!times.some(at=>at>now-WINDOW_MS))requests.delete(key);const recent=(requests.get(tokenId)||[]).filter(at=>at>now-WINDOW_MS);if(recent.length>=LIMIT){requests.set(tokenId,recent);return false;}recent.push(now);requests.set(tokenId,recent);return true;}
export function resetBadgeRateLimits():void{requests.clear();}
