/**
 * The last reply attempt to one inbound email whose outcome the client does not know as final. `uncertain` means the server
 * answered without a definitive result (no new send is allowed); otherwise the request itself failed and a retry must reuse
 * `attemptId`, which the server replays instead of sending twice.
 */
export type InboundReplyGuard={readonly attemptId:string;readonly uncertain:boolean};

/** One store per owner (the app's QueryClient): it survives unmounts, such as switching threads in the Bandeja. */
const stores=new WeakMap<object,Map<string,InboundReplyGuard>>();
const storeOf=(owner:object)=>{let store=stores.get(owner);if(!store){store=new Map();stores.set(owner,store)}return store};

/** Current guard for `inboundId`, or null when a new attempt is allowed. */
export function getInboundReplyGuard({owner,inboundId}:{owner:object;inboundId:string}):InboundReplyGuard|null{
 return storeOf(owner).get(inboundId)??null;
}

/** Stores (or clears, with `guard:null`) the guard for `inboundId`. Readers pick it up when they mount. */
export function setInboundReplyGuard({owner,inboundId,guard}:{owner:object;inboundId:string;guard:InboundReplyGuard|null}):void{
 const store=storeOf(owner);
 if(guard)store.set(inboundId,guard);else store.delete(inboundId);
}

/** Message statuses that still leave the outcome of a send open. */
const OPEN_STATUSES:readonly string[]=['submitting','unknown'];
/** True once the reply message has a status that settles the attempt (sent, failed, resolved by an admin…). */
export function isSettledReplyStatus({status}:{status:string|null|undefined}):boolean{
 return !!status&&!OPEN_STATUSES.includes(status);
}
