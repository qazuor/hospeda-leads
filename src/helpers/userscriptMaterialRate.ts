const WINDOW_MS=10*60_000,LIMIT=6;
const requests=new Map<string,number[]>(),active=new Set<string>();
export function beginMaterialDownload(tokenId:string,now=Date.now()):{allowed:boolean;retryAfter:number;finish:()=>void}{
 const times=(requests.get(tokenId)??[]).filter(at=>at>now-WINDOW_MS),retryAfter=times.length>=LIMIT?Math.max(1,Math.ceil((times[0]!+WINDOW_MS-now)/1000)):0;
 if(retryAfter||active.has(tokenId)){requests.set(tokenId,times);return {allowed:false,retryAfter:retryAfter||60,finish:()=>{}};}
 times.push(now);requests.set(tokenId,times);active.add(tokenId);let finished=false;
 return {allowed:true,retryAfter:0,finish:()=>{if(!finished){finished=true;active.delete(tokenId);}}};
}
export function resetMaterialDownloadLimits():void{requests.clear();active.clear();}
