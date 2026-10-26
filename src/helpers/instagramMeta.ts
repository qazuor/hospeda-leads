export async function metaGet(url:string,timeoutMs=8000){return fetch(url,{signal:AbortSignal.timeout(timeoutMs)});}
