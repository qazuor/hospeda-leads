import {SALES_MATERIAL_FORMAT_LABELS,formatBytes,type SalesMaterialFormat} from '../helpers/salesMaterialTypes';
/** Escapes text for HTML content and double- or single-quoted attributes. Title and description are admin text: everything goes through here. */
export const escapeHtml=(value:string):string=>value.replace(/[&<>"'`]/g,c=>'&#'+c.charCodeAt(0)+';');
/**
 * Enforced CSP of the public page (spec 89 §7), not report-only. The page has no JavaScript; files load from our `/m/<token>/*` routes,
 * which redirect to presigned URLs on the R2 S3 origin (hence `<r2>` in img/media/frame).
 */
export function materialPageCsp({r2Origin}:{r2Origin:string|null}):string{
 const r2=r2Origin?' '+r2Origin:'';
 return [`default-src 'none'`,`img-src 'self'${r2}`,`media-src 'self'${r2}`,`frame-src 'self'${r2}`,`style-src 'unsafe-inline'`,`base-uri 'none'`,`form-action 'none'`,`frame-ancestors 'none'`].join('; ');
}
/** Headers shared by every `/m/*` response: no indexing, no caching, no Referer (the token must not travel to R2 or external sites). */
export const PUBLIC_SHARE_HEADERS={'X-Robots-Tag':'noindex, nofollow, noarchive','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'} as const;
/** Brand tokens copied from `src/base.css` (the page is standalone, without the SPA bundle). */
const STYLE=`*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;background:#EEF2F8;color:#0F172A;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.page{display:grid;gap:16px;width:100%;max-width:880px;margin:0 auto;padding:16px}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:18px}.brand img{width:40px;height:40px;border-radius:10px}
.card{display:grid;min-width:0;overflow:hidden;border:1px solid #E3E8F0;border-radius:16px;background:#FFFFFF}
.media{display:grid;place-items:center;min-width:0;background:#E3E8F0}
.media img,.media video{display:block;width:100%;height:auto;max-height:80vh;object-fit:contain;background:#0F172A}
.media .cover{max-height:60vh;object-fit:cover;background:#E3E8F0}
.media iframe{display:block;width:100%;height:80vh;border:0;background:#FFFFFF}
.media audio{width:100%;margin:16px}
.placeholder{display:grid;place-items:center;width:100%;aspect-ratio:1200/630;color:#475569;font-weight:600}
.body{display:grid;gap:12px;min-width:0;padding:20px}
h1{margin:0;font-size:clamp(22px,4vw,28px);line-height:1.25;overflow-wrap:anywhere}
.description{margin:0;white-space:pre-line;overflow-wrap:anywhere;color:#334155}
.meta{margin:0;color:#475569;font-size:14px;overflow-wrap:anywhere}
.actions{display:flex;flex-wrap:wrap;gap:10px}
.button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:10px 18px;border-radius:10px;border:1px solid #2563EB;background:#2563EB;color:#FFFFFF;font-weight:600;text-decoration:none}
.button.secondary{background:#FFFFFF;color:#1D4ED8}
.button:focus-visible{outline:3px solid #0EA5E9;outline-offset:2px}
.state{display:grid;gap:8px;padding:28px 20px;text-align:center}.state h1{font-size:24px}.state p{margin:0;color:#475569}
footer{color:#475569;font-size:13px;text-align:center}
@media(max-width:600px){.page{padding:12px}.body{padding:16px}.actions .button{flex:1 1 100%}.media iframe{height:70vh}}`;
type Head={title:string;description:string;og?:{url:string|null;image:string|null;imageAlt:string}};
function htmlDocument({head,body}:{head:Head;body:string}):string{
 const t=escapeHtml(head.title),d=escapeHtml(head.description);
 const og=head.og?[`<meta property="og:type" content="website">`,`<meta property="og:site_name" content="Hospeda">`,`<meta property="og:locale" content="es_AR">`,`<meta property="og:title" content="${t}">`,`<meta property="og:description" content="${d}">`,...(head.og.url?[`<meta property="og:url" content="${escapeHtml(head.og.url)}">`]:[]),...(head.og.image?[`<meta property="og:image" content="${escapeHtml(head.og.image)}">`,`<meta property="og:image:alt" content="${escapeHtml(head.og.imageAlt)}">`]:[]),`<meta name="twitter:card" content="${head.og.image?'summary_large_image':'summary'}">`,`<meta name="twitter:title" content="${t}">`,`<meta name="twitter:description" content="${d}">`,...(head.og.image?[`<meta name="twitter:image" content="${escapeHtml(head.og.image)}">`]:[])].join(''):'';
 return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow, noarchive"><meta name="referrer" content="no-referrer"><title>${t}</title><meta name="description" content="${d}">${og}<style>${STYLE}</style></head><body><main class="page"><header class="brand"><img src="/hospeda-logo.jpg" alt="" width="40" height="40"><span>Hospeda</span></header>${body}<footer>Material compartido por Hospeda.</footer></main></body></html>`;
}
/** og:description: the description collapsed to one line and cut at 200 characters (spec 89 §7). */
export function ogDescription({description}:{description:string}):string{
 const flat=description.replace(/\s+/g,' ').trim();if(!flat)return 'Material de Hospeda para vos.';
 return flat.length>200?flat.slice(0,199).trimEnd()+'…':flat;
}
/** What the public page needs to render an available material; no business, seller or internal data. */
export type MaterialPageView={
 token:string;/** Absolute public origin from `PUBLIC_APP_URL`; null when unset: then og:url and og:image are omitted (the Host header is never trusted). */baseUrl:string|null;title:string;description:string;format:SalesMaterialFormat;
 fileName:string|null;byteSize:number|null;externalUrl:string|null;hasCover:boolean;
 /** Android Chrome does not render embedded PDFs: show the cover and «Abrir PDF» instead of the iframe. */
 android:boolean;
};
/** Renders the public material page: Open Graph for previews, the material inline, and «Descargar» for files. */
export function renderMaterialPage(v:MaterialPageView):string{
 const base=`/m/${v.token}`,file=escapeHtml(base+'/file'),download=escapeHtml(base+'/download'),coverSrc=escapeHtml(base+'/cover'),title=escapeHtml(v.title);
 const cover=v.hasCover?`<img class="cover" src="${coverSrc}" alt="">`:'';
 const placeholder=`<div class="placeholder">${escapeHtml(SALES_MATERIAL_FORMAT_LABELS[v.format])}</div>`;
 let media='',actions='';
 if(v.format==='image')media=`<img src="${file}" alt="${title}">`;
 else if(v.format==='pdf'){media=v.android?cover||placeholder:`<iframe src="${file}" title="${escapeHtml('PDF: '+v.title)}"></iframe>`;actions+=`<a class="button secondary" href="${file}" target="_blank" rel="noopener noreferrer">Abrir PDF</a>`;}
 else if(v.format==='video')media=`<video controls preload="metadata" playsinline src="${file}"${v.hasCover?` poster="${coverSrc}"`:''}>Tu navegador no puede reproducir este video. Usá «Descargar».</video>`;
 else if(v.format==='audio')media=`${cover}<audio controls preload="metadata" src="${file}">Tu navegador no puede reproducir este audio. Usá «Descargar».</audio>`;
 else media=cover||placeholder;
 if(v.externalUrl)actions+=`<a class="button" href="${escapeHtml(v.externalUrl)}" target="_blank" rel="noopener noreferrer">Abrir</a>`;
 else actions+=`<a class="button" href="${download}">Descargar</a>`;
 const host=v.externalUrl?(()=>{try{return new URL(v.externalUrl).host}catch{return ''}})():'';
 const meta=v.externalUrl?(host?`Enlace a ${escapeHtml(host)}`:''):[v.fileName?escapeHtml(v.fileName):'',v.byteSize?escapeHtml(formatBytes({bytes:v.byteSize})):''].filter(Boolean).join(' · ');
 const pageUrl=v.baseUrl?v.baseUrl+base:null;
 const body=`<article class="card"><div class="media">${media}</div><div class="body"><h1>${title}</h1>${v.description.trim()?`<p class="description">${escapeHtml(v.description.trim())}</p>`:''}${meta?`<p class="meta">${meta}</p>`:''}<div class="actions">${actions}</div></div></article>`;
 return htmlDocument({head:{title:v.title,description:ogDescription({description:v.description}),og:{url:pageUrl,image:v.baseUrl?(v.hasCover?pageUrl+'/cover':v.baseUrl+'/hospeda-logo.jpg'):null,imageAlt:v.title}},body});
}
/** The public states of a link (spec 89 §7). Unknown tokens all get the same page, whatever the reason. */
export type MaterialPageState='unknown'|'revoked'|'unavailable'|'storage'|'rate_limited'|'error';
const STATES:Record<MaterialPageState,{status:number;title:string;message:string}>={
 unknown:{status:404,title:'Este enlace no es válido',message:'Revisá que esté completo o pedile a quien te lo mandó que te lo vuelva a enviar.'},
 revoked:{status:410,title:'Este enlace ya no está disponible',message:'Quien te lo mandó lo dio de baja. Si todavía lo necesitás, pedile uno nuevo.'},
 unavailable:{status:410,title:'Este material ya no está disponible',message:'Hospeda lo retiró o lo reemplazó. Si lo necesitás, pedile el material actualizado a quien te lo mandó.'},
 storage:{status:503,title:'El material no está disponible en este momento',message:'Probá de nuevo en unos minutos.'},
 rate_limited:{status:429,title:'Demasiados pedidos seguidos',message:'Esperá unos minutos y volvé a abrir el enlace.'},
 error:{status:500,title:'No pudimos abrir el material',message:'Probá de nuevo en unos minutos.'}
};
/** HTTP status of a state page. */
export const materialStateStatus=(state:MaterialPageState):number=>STATES[state].status;
/** Renders a state page (404, 410, 429, 500, 503) with the same brand, no Open Graph and noindex. */
export function renderMaterialStatePage({state}:{state:MaterialPageState}):string{
 const s=STATES[state];
 return htmlDocument({head:{title:s.title,description:s.message},body:`<article class="card"><div class="state"><h1>${escapeHtml(s.title)}</h1><p>${escapeHtml(s.message)}</p></div></article>`});
}
/** Full HTML response with the enforced CSP and the public headers. `head` drops the body (HEAD requests). */
export function materialHtmlResponse({html,status,r2Origin,head=false}:{html:string;status:number;r2Origin:string|null;head?:boolean}):Response{
 return new Response(head?null:html,{status,headers:{...PUBLIC_SHARE_HEADERS,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':materialPageCsp({r2Origin}),...(status===429?{'Retry-After':'600'}:{})}});
}
