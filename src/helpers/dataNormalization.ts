export type Validity='valid'|'invalid'|'ambiguous'|'missing'|'unverified';
export type Normalized={original:string|null; normalized:string|null; validity:Validity; observations:string};
export const businessFields=['nombre','ciudad','telefono','email','sitioWeb','urlGmap','perfilInstagram','perfilFacebook','perfilAirbnb','perfilBooking','perfilTurismoEntreRios'] as const;
export const importFields=[...businessFields,'tipo','subtipo','estado','suscripcion','origen','fuenteReferencia','prioridad','notas','archivoAdjunto','fechaCreacion','fechaUltimoContacto','fechaProximaAccion','medioContactoPreferido','resultadoUltimoContacto','clientePotencialRecurrente','quienCargo','creadoPor','asignadoA'] as const;
export const comparisonName=(s:string|null|undefined)=>(s??'').normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('es-AR').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
export function normalizeField(field:string,value:string|null|undefined):Normalized{
 const original=value??null,s=value?.trim()??'';
 const result=(normalized:string|null,validity:Validity,observations=''):Normalized=>({original,normalized,validity,observations});
 if(!s)return result(null,'missing','Sin dato');
 if(field==='telefono'||field==='phone'){
  if(!/^\+?[\d\s().-]+$/.test(s))return result(null,'ambiguous','Varios números, internos o texto: revisar sin modificar.');
  const digits=s.replace(/\D/g,'');
  if(s.startsWith('+')||s.startsWith('00')){
   const d=s.startsWith('00')?digits.slice(2):digits;
   if(d.startsWith('54')&&!/^54(?:9\d{10}|\d{10})$/.test(d))return result(null,'ambiguous','Formato argentino internacional no inequívoco.');
   if(d.length<8||d.length>15)return result(null,'invalid','Longitud internacional inválida.');
   return result('+'+d,'valid');
  }
  if(/^549\d{10}$/.test(digits))return result('+'+digits,'valid');
  const national=digits.startsWith('0')?digits.slice(1):digits;
  if(/^\d{10}$/.test(national))return result('+54'+national,'valid','No se infiere si es móvil: no se agrega 9.');
  if(digits.length<6||digits.length>15)return result(null,'invalid','Longitud inválida.');
  return result(null,'ambiguous','Falta prefijo o contiene 15 local. No se infiere código de área ni móvil.');
 }
 if(field==='email'){
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))return result(null,'invalid','Email inválido o múltiples direcciones.');
  const at=s.lastIndexOf('@');return result(s.slice(0,at)+'@'+s.slice(at+1).toLowerCase(),'valid','Se conserva mayúscula/minúscula de la parte local.');
 }
 if(['sitioWeb','urlGmap','perfilInstagram','perfilFacebook','perfilAirbnb','perfilBooking','perfilTurismoEntreRios','archivoAdjunto'].includes(field)){
  try{const explicit=/^https?:\/\//i.test(s);const u=new URL(explicit?s:'https://'+s);if(!u.hostname.includes('.')||u.username||u.password||!['http:','https:'].includes(u.protocol))throw new Error();return result(u.toString(),explicit?'valid':'ambiguous',explicit?'':'Protocolo ausente: sugerencia https, conservar original.');}catch{return result(null,'invalid','URL HTTP(S) inválida.');}
 }
 if(field==='nombre'||field==='ciudad'||field==='name')return result(comparisonName(s),'valid','Solo para comparar; no cambia el texto visible.');
 return result(s,'unverified');
}
export type Match={id:string; nombre:string; ciudad:string|null; reasons:string[]; kind:'duplicate_candidate'|'shared_person_or_related'; revision:string;current:Record<string,string|null>};
export function matchAccounts(input:Record<string,string|null|undefined>,rows:Array<{id:string;nombre:string;ciudad:string|null;telefono:string|null;email:string|null;sitioWeb:string|null;updatedAt:Date}>):Match[]{
 return rows.flatMap(a=>{
  const reasons:string[]=[];
  const name=!!comparisonName(input.nombre)&&comparisonName(a.nombre)===comparisonName(input.nombre);
  const city=!!comparisonName(input.ciudad)&&comparisonName(a.ciudad)===comparisonName(input.ciudad);
  if(name&&city)reasons.push('Nombre y localidad normalizados coinciden');
  for(const [field,label] of [['telefono','Teléfono'],['email','Email'],['sitioWeb','Sitio web']] as const){
   const n=normalizeField(field,input[field]),v=normalizeField(field,a[field]);
   if(n.validity==='valid'&&v.validity==='valid'&&n.normalized&&n.normalized===v.normalized)reasons.push(label+' compartido');
  }
  return reasons.length?[{id:String(a.id),nombre:a.nombre,ciudad:a.ciudad,reasons,kind:name&&city?'duplicate_candidate' as const:'shared_person_or_related' as const,revision:a.updatedAt.toISOString(),current:Object.fromEntries(businessFields.map(f=>[f,String(a[f as keyof typeof a]??'')||null]))}]:[];
 });
}

// Index comparison keys once; avoid quadratic normalization scans on the full CRM.
export function duplicateAccountPairs(rows:Parameters<typeof matchAccounts>[1]){
 const keys=new Map<string,number[]>();
 rows.forEach((a,i)=>{
  const name=comparisonName(a.nombre),city=comparisonName(a.ciudad);
  const signatures:string[]=name&&city?['name:'+JSON.stringify([name,city])]:[];
  for(const f of ['telefono','email','sitioWeb'] as const){const n=normalizeField(f,a[f]);if(n.validity==='valid'&&n.normalized)signatures.push(f+':'+n.normalized);}
  for(const key of signatures){const bucket=keys.get(key)??[];bucket.push(i);keys.set(key,bucket);}
 });
 const pairs=new Set<string>();
 for(const bucket of keys.values())for(let i=0;i<bucket.length;i++)for(let j=i+1;j<bucket.length;j++)pairs.add(bucket[i]+':'+bucket[j]);
 return [...pairs].map(pair=>{const [i,j]=pair.split(':').map(Number),a=rows[i],b=rows[j];const match=matchAccounts({nombre:a.nombre,ciudad:a.ciudad,telefono:a.telefono,email:a.email,sitioWeb:a.sitioWeb},[b])[0];return {a,b,match};});
}
