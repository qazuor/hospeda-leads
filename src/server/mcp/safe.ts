export type McpErrorCode='grant_missing'|'reader_unsafe'|'not_found'|'invalid_input'|'permission_denied'|'timeout'|'internal_error';
export function safePath(path:string){return path.split('?')[0]!.slice(0,200);}
export function safeReceivedOrigin(value:string){try{return new URL(value).origin.slice(0,200);}catch{return value==='null'?'null':'invalid';}}
export function safeReceivedHost(value:string){try{return new URL('http://'+value).host.slice(0,200);}catch{return 'invalid';}}
export function classifyToolError(error:unknown):McpErrorCode{
 const e=error as {code?:unknown;message?:unknown;name?:unknown};
 if(e?.code==='MCP_READER_GRANTS_INCOMPLETE')return 'grant_missing';
 if(e?.code==='MCP_READER_UNSAFE')return 'reader_unsafe';
 if(e?.name==='ZodError')return 'invalid_input';
 if(e?.code==='42501')return 'permission_denied';
 if(e?.code==='NOT_FOUND')return 'not_found';
 if(e?.code==='INVALID_INPUT')return 'invalid_input';
 if(e?.code==='PERMISSION_DENIED')return 'permission_denied';
 if(e?.code==='57014'||e?.code==='ETIMEDOUT'||String(e?.message??'').toLowerCase().includes('timeout'))return 'timeout';
 return 'internal_error';
}
export function toolError(code:McpErrorCode){const text=code==='grant_missing'||code==='reader_unsafe'||code==='permission_denied'?`Falta configurar el acceso de lectura del CRM. Avisá al administrador (código ${code}).`:code==='timeout'?`La consulta tardó demasiado; probá con un filtro más chico (código ${code}).`:code==='not_found'?'No se encontró el registro solicitado. Revisá el identificador (código not_found).':code==='invalid_input'?'Los datos de la consulta no son válidos. Revisá los filtros (código invalid_input).':`Error interno del CRM (código ${code}). Probá de nuevo más tarde.`;return text.replace(/[\r\n]+/g,' ').slice(0,200);}
