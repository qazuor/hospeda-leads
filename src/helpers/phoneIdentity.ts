/** Digits of a phone as typed («+54 9 (3442) 55-5111» → «5493442555111»). */
export const phoneDigits=({phone}:{phone:string|null|undefined}):string=>(phone??'').replace(/\D/g,'');

/**
 * Spec 99 §3.4: whether two phones are the same line, for identity (never for search). Equal digits, or both with at least
 * 10 digits and the same last 10 (covers the +54 / 9 / 0 prefixes of Argentine numbers). A shorter suffix never matches, so
 * 341-4123456 and 351-4123456 stay different. Pure, shared by the client and the server.
 */
export function samePhone({a,b}:{a:string|null|undefined;b:string|null|undefined}):boolean{
 const da=phoneDigits({phone:a}),db=phoneDigits({phone:b});
 if(!da||!db)return false;
 return da===db||(da.length>=10&&db.length>=10&&da.slice(-10)===db.slice(-10));
}
