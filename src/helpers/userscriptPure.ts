export const USERSCRIPT_MIN_VERSION='1.0.0';
export function compareSemver(a:string,b:string):number{const parse=(v:string)=>v.split('.').map(Number);const x=parse(a),y=parse(b);for(let i=0;i<3;i++){const d=(x[i]??0)-(y[i]??0);if(d)return d;}return 0;}
export function codeFromTitle(title:string):string|null{return title.match(/·\s*H(\d+)\s*$/i)?.[1]??null;}
export function codeFromParam(code:string):string|null{return code.match(/^H(\d+)$/i)?.[1]??null;}
export function agendaName(name:string,id:string|number):string{return `${name.trim().replace(/\s+/g,' ').replace(/\s*·\s*H\d+\s*$/i,'').trim()} · H${id}`;}
export function validateUserscriptBatch(messages:readonly {externalId:string;text:string}[]):string|null{if(messages.length<1||messages.length>50)return 'El lote debe incluir entre 1 y 50 mensajes.';for(const m of messages){if(!m.externalId||m.externalId.length>300)return 'Identificador de mensaje inválido.';if(!m.text.trim())return 'El mensaje no puede estar vacío.';}return null;}
