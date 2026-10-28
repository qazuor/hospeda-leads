import {describe,expect,it} from 'vitest';
import {BREVO_ATTACHMENT_EXTENSIONS,MaterialShareUrlUnavailable,appendMaterialLink,attachBlockReasons,fileExtension,materialLinkSnippet,materialShareUrl,megabytesLabel,redactPresignedUrls,removeMaterialLink,shareTokenHashesInBody,shareUrlInBody} from './salesMaterialMessage';
import {hashShareToken} from './salesMaterialShare';

const tokenA='A'.repeat(42)+'E',tokenB='b'.repeat(42)+'Q';
const urlA='https://crm.example.test/m/'+tokenA,urlB='https://crm.example.test/m/'+tokenB;

describe('materialShareUrl',()=>{
 it('joins PUBLIC_APP_URL and the share path without double slashes',()=>{
  expect(materialShareUrl({path:'/m/'+tokenA,base:'https://crm.example.test/'})).toBe(urlA);
 });
 it('falls back to the local server when the base is missing outside production',()=>{
  expect(materialShareUrl({path:'/m/x',base:null,production:false})).toBe('http://localhost:3001/m/x');
 });
 it('fails closed in production without PUBLIC_APP_URL instead of sending a localhost link',()=>{
  expect(()=>materialShareUrl({path:'/m/x',base:'  ',production:true})).toThrow(MaterialShareUrlUnavailable);
  expect(materialShareUrl({path:'/m/x',base:'https://crm.example.test',production:true})).toBe('https://crm.example.test/m/x');
 });
});

describe('material links in the body',()=>{
 it('adds «Podés ver «Título» en: URL» on its own line in WhatsApp (owner review of spec 96)',()=>{
  expect(appendMaterialLink({channel:'whatsapp',body:'Hola Ana\n',title:'Folleto 2027',url:urlA})).toBe(`Hola Ana\n\nPodés ver «Folleto 2027» en: ${urlA}`);
  expect(appendMaterialLink({channel:'whatsapp',body:'',title:'Folleto',url:urlA})).toBe(`Podés ver «Folleto» en: ${urlA}`);
 });
 it('still removes the older «Título: URL» line of drafts saved before the lead-in',()=>{
  expect(removeMaterialLink({channel:'whatsapp',body:`Hola Ana\n\nFolleto 2027: ${urlA}`,title:'Folleto 2027',url:urlA})).toBe('Hola Ana');
  expect(removeMaterialLink({channel:'whatsapp',body:appendMaterialLink({channel:'whatsapp',body:'Hola Ana',title:'Folleto 2027',url:urlA}),title:'Folleto 2027',url:urlA})).toBe('Hola Ana');
  expect(removeMaterialLink({channel:'email',body:appendMaterialLink({channel:'email',body:'<p>Hola</p>',title:'Tarifas & más',url:urlA}),title:'Tarifas & más',url:urlA})).toBe('<p>Hola</p>');
 });
 it('adds an escaped paragraph with the link in email and replaces an empty body',()=>{
  expect(materialLinkSnippet({channel:'email',title:'Tarifas <b>& más',url:urlA})).toBe(`<p>Podés ver «Tarifas &#60;b&#62;&#38; más» en: <a href="${urlA}">${urlA}</a></p>`);
  expect(appendMaterialLink({channel:'email',body:'<p></p>',title:'Folleto',url:urlA})).toBe(`<p>Podés ver «Folleto» en: <a href="${urlA}">${urlA}</a></p>`);
  expect(appendMaterialLink({channel:'email',body:'<p>Hola</p>',title:'Folleto',url:urlA})).toBe(`<p>Hola</p><p>Podés ver «Folleto» en: <a href="${urlA}">${urlA}</a></p>`);
 });
 it('removes only the line or paragraph of that link and keeps the rest of the text',()=>{
  const wa=`Hola\n\nFolleto: ${urlA}\n\nTour: ${urlB}`;
  expect(removeMaterialLink({channel:'whatsapp',body:wa,url:urlA,title:'Folleto'})).toBe(`Hola\n\nTour: ${urlB}`);
  expect(removeMaterialLink({channel:'whatsapp',body:wa,url:urlB,title:'Tour'})).toBe(`Hola\n\nFolleto: ${urlA}`);
  const mail=`<p>Hola</p><p>Folleto: <a href="${urlA}">${urlA}</a></p><p>Tour: <a href="${urlB}">${urlB}</a></p>`;
  expect(removeMaterialLink({channel:'email',body:mail,url:urlA,title:'Folleto'})).toBe(`<p>Hola</p><p>Tour: <a href="${urlB}">${urlB}</a></p>`);
 });
 it('keeps what the seller wrote on the same WhatsApp line (regression: the whole line was dropped)',()=>{
  expect(removeMaterialLink({channel:'whatsapp',body:`Hola\nTe paso el folleto ${urlA} y cualquier cosa me avisás`,url:urlA,title:'Folleto'})).toBe('Hola\nTe paso el folleto y cualquier cosa me avisás');
  expect(removeMaterialLink({channel:'whatsapp',body:`Mirá Folleto: ${urlA} y decime`,url:urlA,title:'Folleto'})).toBe('Mirá y decime');
 });
 it('keeps what the seller wrote in the same email paragraph (regression: the whole paragraph was dropped)',()=>{
  expect(removeMaterialLink({channel:'email',body:`<p>Uno</p><p>Mirá <a href="${urlA}">esto</a> hoy</p>`,url:urlA,title:'Folleto'})).toBe('<p>Uno</p><p>Mirá hoy</p>');
  expect(removeMaterialLink({channel:'email',body:`<p>Te mando Tarifas &#60;b&#62;: <a href="${urlA}">${urlA}</a>. Saludos</p>`,url:urlA,title:'Tarifas <b>'})).toBe('<p>Te mando. Saludos</p>');
  expect(removeMaterialLink({channel:'email',body:`<p>Link suelto ${urlA}</p>`,url:urlA,title:'X'})).toBe('<p>Link suelto</p>');
 });
 it('leaves the body untouched when the link is not there',()=>{
  expect(removeMaterialLink({channel:'whatsapp',body:'Hola',url:urlA,title:'Folleto'})).toBe('Hola');
 });
});

describe('redactPresignedUrls',()=>{
 it('strips the signature query of presigned URLs before an error is stored',()=>{
  const text='{"message":"Failed to fetch https://acct.r2.cloudflarestorage.com/bucket/a.pdf?X-Amz-Algorithm=AWS4&X-Amz-Signature=abc123 (404)"}';
  expect(redactPresignedUrls({text})).toBe('{"message":"Failed to fetch https://acct.r2.cloudflarestorage.com/bucket/a.pdf?[redacted] (404)"}');
  expect(redactPresignedUrls({text:'sin url'})).toBe('sin url');
 });
});

describe('share tokens in the body',()=>{
 it('finds every token as its hash, ignoring longer look-alikes',()=>{
  const hashes=shareTokenHashesInBody({body:`a ${urlA} b <a href="${urlB}">x</a> /m/${tokenA}xyz`});
  expect([...hashes].sort()).toEqual([hashShareToken({token:tokenA}),hashShareToken({token:tokenB})].sort());
 });
 it('returns the full URL of the share whose hash matches',()=>{
  expect(shareUrlInBody({body:`Folleto: ${urlA}\nTour: ${urlB}`,tokenHash:hashShareToken({token:tokenB})})).toBe(urlB);
  expect(shareUrlInBody({body:'nada',tokenHash:hashShareToken({token:tokenB})})).toBeNull();
 });
});

describe('attachBlockReasons',()=>{
 const limitBytes=10*1048576;
 it('labels limits in MB',()=>{expect(megabytesLabel({bytes:limitBytes})).toBe('10 MB');expect(megabytesLabel({bytes:1572864})).toBe('1.5 MB');});
 it('never attaches in WhatsApp',()=>{
  expect(attachBlockReasons({channel:'whatsapp',limitBytes,items:[{id:'a',source:'file',fileName:'a.pdf',byteSize:10,attach:false}]})).toEqual({a:'WhatsApp no adjunta archivos: va solo el enlace.'});
 });
 it('refuses external links and files over the limit, with the reason the composer shows',()=>{
  expect(attachBlockReasons({channel:'email',limitBytes,items:[{id:'u',source:'url',fileName:null,byteSize:null,attach:false},{id:'big',source:'file',fileName:'big.pdf',byteSize:limitBytes+1,attach:false},{id:'ok',source:'file',fileName:'ok.pdf',byteSize:limitBytes,attach:false}]})).toEqual({u:'Es un enlace externo: va solo el enlace.',big:'Supera el límite de adjuntos de email (10 MB).',ok:null});
 });
 it('keeps the sum of the attachments of one message within the limit',()=>{
  const reasons=attachBlockReasons({channel:'email',limitBytes,items:[{id:'a',source:'file',fileName:'a.pdf',byteSize:6*1048576,attach:true},{id:'b',source:'file',fileName:'b.pdf',byteSize:5*1048576,attach:false},{id:'c',source:'file',fileName:'c.jpg',byteSize:4*1048576,attach:false}]});
  expect(reasons).toEqual({a:null,b:'Con este archivo, los adjuntos superan el límite de email (10 MB).',c:null});
 });
 it('refuses file types Brevo does not attach and files without a name (regression: webp/webm went to Brevo)',()=>{
  expect(attachBlockReasons({channel:'email',limitBytes,items:[{id:'w',source:'file',fileName:'foto.webp',byteSize:10,attach:false},{id:'v',source:'file',fileName:'clip.WEBM',byteSize:10,attach:false},{id:'n',source:'file',fileName:null,byteSize:10,attach:false},{id:'p',source:'file',fileName:'Tarifas.PDF',byteSize:10,attach:false}]})).toEqual({w:'Brevo no adjunta este tipo de archivo (.webp): va solo el enlace.',v:'Brevo no adjunta este tipo de archivo (.webm): va solo el enlace.',n:'El archivo no tiene nombre: va solo el enlace.',p:null});
 });
 it('keeps the Brevo extension list in one place',()=>{
  expect(BREVO_ATTACHMENT_EXTENSIONS).toContain('pdf');expect(BREVO_ATTACHMENT_EXTENSIONS).not.toContain('webp');expect(BREVO_ATTACHMENT_EXTENSIONS).not.toContain('webm');
  expect(fileExtension({fileName:'a.b.MP4'})).toBe('mp4');expect(fileExtension({fileName:'sin-extension'})).toBeNull();
 });
});
