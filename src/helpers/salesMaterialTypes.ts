/** Pure rules for sales material files, shared by the browser and the server (no Node imports). */
export const SALES_MATERIAL_MAX_UPLOAD_BYTES=524288000;
export const SALES_MATERIAL_MAX_COVER_BYTES=1048576;
/** Allowed MIME types with their accepted extensions (spec 89 §6.3). Extension and MIME must match. */
export const SALES_MATERIAL_TYPES={
 'image/jpeg':['jpg','jpeg'],'image/png':['png'],'image/webp':['webp'],'image/gif':['gif'],
 'application/pdf':['pdf'],
 'video/mp4':['mp4','m4v'],'video/webm':['webm'],'video/quicktime':['mov'],
 'audio/mpeg':['mp3'],'audio/mp4':['m4a'],'audio/ogg':['ogg','oga'],'audio/wav':['wav'],
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':['docx'],
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['xlsx'],
 'application/vnd.openxmlformats-officedocument.presentationml.presentation':['pptx'],
 'application/msword':['doc'],'application/vnd.ms-excel':['xls'],'application/vnd.ms-powerpoint':['ppt']
} as const satisfies Record<string,readonly string[]>;
/** An allowed MIME type. */
export type SalesMaterialMime=keyof typeof SALES_MATERIAL_TYPES;
export const SALES_MATERIAL_MIMES=Object.keys(SALES_MATERIAL_TYPES) as [SalesMaterialMime,...SalesMaterialMime[]];
export const SALES_MATERIAL_COVER_MIMES=['image/jpeg','image/png','image/webp','image/gif'] as const;
/** `accept` attribute for file inputs. */
export const SALES_MATERIAL_ACCEPT=Object.entries(SALES_MATERIAL_TYPES).flatMap(([mime,exts])=>[mime,...exts.map(e=>'.'+e)]).join(',');
/** Broad family used for labels, icons and previews. */
export type SalesMaterialFormat='image'|'pdf'|'video'|'audio'|'office'|'link';
/** Format of a version from its MIME type (null MIME means an external URL). */
export function salesMaterialFormat({mimeType}:{mimeType:string|null}):SalesMaterialFormat{
 if(!mimeType)return 'link';if(mimeType.startsWith('image/'))return 'image';if(mimeType==='application/pdf')return 'pdf';if(mimeType.startsWith('video/'))return 'video';if(mimeType.startsWith('audio/'))return 'audio';return 'office';
}
/** Spanish label of a format. */
export const SALES_MATERIAL_FORMAT_LABELS:Record<SalesMaterialFormat,string>={image:'Imagen',pdf:'PDF',video:'Video',audio:'Audio',office:'Documento',link:'Enlace externo'};
/** Lowercase extension of a file name, or '' when it has none. */
export const fileExtension=({fileName}:{fileName:string}):string=>{const i=fileName.lastIndexOf('.');return i>0?fileName.slice(i+1).toLowerCase():''};
/** Why a declared upload is rejected, or null when it is acceptable. Covers must be images of up to 1 MB. */
export function uploadDeclarationError({purpose,fileName,mimeType,byteSize,maxUploadBytes=SALES_MATERIAL_MAX_UPLOAD_BYTES}:{purpose:'file'|'cover';fileName:string;mimeType:string;byteSize:number;maxUploadBytes?:number}):string|null{
 const exts=(SALES_MATERIAL_TYPES as Record<string,readonly string[]|undefined>)[mimeType];
 if(!exts)return 'Ese tipo de archivo no está permitido.';
 if(!exts.includes(fileExtension({fileName})))return 'La extensión del archivo no coincide con su tipo.';
 if(purpose==='cover'&&!(SALES_MATERIAL_COVER_MIMES as readonly string[]).includes(mimeType))return 'La portada tiene que ser una imagen.';
 const limit=purpose==='cover'?SALES_MATERIAL_MAX_COVER_BYTES:maxUploadBytes;
 if(!Number.isInteger(byteSize)||byteSize<1)return 'El archivo está vacío.';
 if(byteSize>limit)return `El archivo supera el límite de ${formatBytes({bytes:limit})}.`;
 return null;
}
const ascii=(b:Uint8Array,from:number,text:string)=>text.split('').every((c,i)=>b[from+i]===c.charCodeAt(0));
/** Signatures that name exactly one allowed type, checked in order. MP4/MOV/M4A, Office (zip/OLE) and MPEG frames are ambiguous and absent. */
const SNIFFABLE=['application/pdf','image/png','image/jpeg','image/gif','image/webp','video/webm','audio/ogg','audio/wav'] as const satisfies readonly SalesMaterialMime[];
/** The allowed type the first bytes of a file prove (16 bytes are enough), or null when they prove none unambiguously. */
export function sniffSalesMaterialMime({bytes}:{bytes:Uint8Array}):SalesMaterialMime|null{
 return SNIFFABLE.find(mimeType=>signatureMatches({mimeType,bytes}))??(ascii(bytes,0,'ID3')?'audio/mpeg':null);
}
/**
 * Owner review of spec 96 (28/10/2026): a file whose extension lies about its content (a JPEG saved as «.png», common with downloaded
 * photos) is uploaded under its real type instead of failing the server's signature check after the whole upload. Returns the real type
 * and the file name with the right extension, or null when the declared type already matches or the bytes do not prove another type.
 * The server still checks the signature of what it receives.
 */
export function correctedSalesMaterialFile({fileName,declaredMime,bytes}:{fileName:string;declaredMime:SalesMaterialMime;bytes:Uint8Array}):{mimeType:SalesMaterialMime;fileName:string}|null{
 if(signatureMatches({mimeType:declaredMime,bytes}))return null;
 const mimeType=sniffSalesMaterialMime({bytes});if(!mimeType||mimeType===declaredMime)return null;
 const dot=fileName.lastIndexOf('.'),base=dot>0?fileName.slice(0,dot):fileName;
 return {mimeType,fileName:`${base}.${SALES_MATERIAL_TYPES[mimeType][0]}`};
}
/** True when the first bytes of an object match the signature of its declared MIME type (16 bytes are enough). */
export function signatureMatches({mimeType,bytes:b}:{mimeType:string;bytes:Uint8Array}):boolean{
 switch(mimeType){
  case 'application/pdf':return ascii(b,0,'%PDF-');
  case 'image/png':return [137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v);
  case 'image/jpeg':return b[0]===0xff&&b[1]===0xd8&&b[2]===0xff;
  case 'image/gif':return ascii(b,0,'GIF87a')||ascii(b,0,'GIF89a');
  case 'image/webp':return ascii(b,0,'RIFF')&&ascii(b,8,'WEBP');
  case 'video/mp4':case 'video/quicktime':case 'audio/mp4':return ascii(b,4,'ftyp')||mimeType==='video/quicktime'&&['moov','mdat','wide','free'].some(t=>ascii(b,4,t));
  case 'video/webm':return [0x1a,0x45,0xdf,0xa3].every((v,i)=>b[i]===v);
  case 'audio/mpeg':return ascii(b,0,'ID3')||b[0]===0xff&&((b[1]??0)&0xe0)===0xe0;
  case 'audio/ogg':return ascii(b,0,'OggS');
  case 'audio/wav':return ascii(b,0,'RIFF')&&ascii(b,8,'WAVE');
  case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':return b[0]===0x50&&b[1]===0x4b&&b[2]===3&&b[3]===4;
  case 'application/msword':case 'application/vnd.ms-excel':case 'application/vnd.ms-powerpoint':return [0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1].every((v,i)=>b[i]===v);
  default:return false;
 }
}
/** R2 object key: files `materials/<id>/v<n>-<uuid>.<ext>`, covers `covers/<id>/<uuid>.<ext>` (spec 89 §6.3). */
export function salesMaterialObjectKey({purpose,materialId,version,uuid,extension}:{purpose:'file'|'cover';materialId:string;version:number;uuid:string;extension:string}):string{
 const ext=extension.toLowerCase().replace(/[^a-z0-9]/g,'');
 return purpose==='cover'?`covers/${materialId}/${uuid}.${ext}`:`materials/${materialId}/v${version}-${uuid}.${ext}`;
}
/** `Content-Disposition` value with an RFC 5987 file name. */
export function contentDisposition({disposition,fileName}:{disposition:'inline'|'attachment';fileName:string|null}):string{
 if(!fileName)return disposition;
 const fallback=fileName.replace(/[^\x20-\x7e]|["\\]/g,'_');
 return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase())}`;
}
/** Human file size in Spanish formatting (KB/MB). */
export function formatBytes({bytes}:{bytes:number}):string{
 if(bytes<1024*1024)return `${Math.max(1,Math.ceil(bytes/1024))} KB`;
 const mb=bytes/1024/1024;return `${mb>=100?Math.round(mb):mb.toLocaleString('es-AR',{maximumFractionDigits:1})} MB`;
}
/** True for http(s) URLs without credentials; sales material accepts only https. */
export function externalUrlError({url}:{url:string}):string|null{
 let u:URL;try{u=new URL(url)}catch{return 'Pegá una dirección web completa, que empiece con https://.'}
 if(u.protocol!=='https:')return 'Solo se aceptan enlaces https://.';
 if(u.username||u.password)return 'El enlace no puede incluir usuario ni contraseña.';
 return null;
}
/** MIME type to declare for a picked file: the browser's when allowed and consistent, otherwise the one its extension implies (browsers leave some types empty or vendor-specific). */
export function mimeForFile({fileName,type}:{fileName:string;type:string}):SalesMaterialMime|null{
 const ext=fileExtension({fileName});const own=(SALES_MATERIAL_TYPES as Record<string,readonly string[]|undefined>)[type];
 if(own?.includes(ext))return type as SalesMaterialMime;
 return SALES_MATERIAL_MIMES.find(mime=>(SALES_MATERIAL_TYPES[mime] as readonly string[]).includes(ext))??null;
}
