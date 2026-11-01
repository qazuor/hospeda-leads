import {describe,expect,it} from 'vitest';
import {BREVO_ATTACHMENT_EXTENSIONS,MaterialShareUrlUnavailable,appendMaterialLink,attachBlockReasons,contactChannelOf,materialChannelOf,fileExtension,materialLinkSnippet,materialShareUrl,megabytesLabel,redactPresignedUrls,removeMaterialLink,shareSlugIntactInBody,shareTokenHashesInBody,shareUrlInBody,whatsappAttachEligibility,whatsappAttachGroupEligible,whatsappAttachSingleEligible,WHATSAPP_ATTACH_MAX_BYTES} from './salesMaterialMessage';
import {hashShareToken} from './salesMaterialShare';

const tokenA='A'.repeat(42)+'E',tokenB='b'.repeat(42)+'Q';
const urlA='https://crm.example.test/m/'+tokenA,urlB='https://crm.example.test/m/'+tokenB;

describe('whatsappAttachEligibility',()=>{
 it('permits attaching only when the draft contains one material',()=>{expect(whatsappAttachGroupEligible(1)).toBe(true);expect(whatsappAttachGroupEligible(2)).toBe(false);});
 it('requires the sole material to be eligible before attachment',()=>{expect(whatsappAttachSingleEligible(1,true)).toBe(true);expect(whatsappAttachSingleEligible(2,true)).toBe(false);expect(whatsappAttachSingleEligible(1,false)).toBe(false);});
 it('allows a file exactly at 50 MB and derives its display name and kind',()=>expect(whatsappAttachEligibility({source:'file',title:'Folleto 2027',fileName:'upload.PDF',mimeType:'application/pdf',byteSize:WHATSAPP_ATTACH_MAX_BYTES})).toMatchObject({eligible:true,fileName:'Folleto 2027.pdf',kind:'document'}));
 it('rejects oversize and external materials, recognizes D3 images, and hides the switch reason',()=>{expect(whatsappAttachEligibility({source:'file',title:'Foto',fileName:'x.webp',mimeType:'image/webp',byteSize:1}).kind).toBe('image');expect(whatsappAttachEligibility({source:'file',title:'Grande',fileName:'x.pdf',mimeType:'application/pdf',byteSize:WHATSAPP_ATTACH_MAX_BYTES+1}).eligible).toBe(false);expect(whatsappAttachEligibility({source:'url',title:'Web',fileName:null,mimeType:null,byteSize:null})).toMatchObject({eligible:false,reason:'Es un enlace externo: va solo el enlace.'});expect(whatsappAttachEligibility({source:'file',title:'x',fileName:'x.pdf',mimeType:'application/pdf',byteSize:1,enabled:false})).toMatchObject({eligible:false,reason:null});});
});

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
 // Spec 101: short links `/m/<slug>-<4 chars>`, only with the CRM origin.
 const origin='https://crm.example.test',short=origin+'/m/folleto-2027-Ab3x';
 it('finds short links with the CRM origin, in plain text and inside an email anchor (regression: dispatch must not revoke them as removed)',()=>{
  const h=hashShareToken({token:'Ab3x'});
  expect([...shareTokenHashesInBody({body:`Podés ver «Folleto» en: ${short}`,origin})]).toEqual([h]);
  expect([...shareTokenHashesInBody({body:`<p>Podés ver: <a href="${short}">${short}</a></p>`,origin})]).toEqual([h]);
  expect([...shareTokenHashesInBody({body:`Mirá ${short}. Y ${origin}/m/tour-XyZ9, chau`,origin})].sort()).toEqual([h,hashShareToken({token:'XyZ9'})].sort());
  expect(shareUrlInBody({body:`Ver ${short}.`,tokenHash:h,origin})).toBe(short);
 });
 it('ignores look-alike paths of other sites and longer or broken tails',()=>{
  for(const body of ['https://otro.example/m/folleto-Ab3x','/m/folleto-Ab3x',`${origin}/m/folleto-Ab3xy`,`${origin}/m/folleto-Ab3_`])expect(shareTokenHashesInBody({body,origin}).size,body).toBe(0);
 });
 it('reads a 43-character segment as a short link when its slug is generated, and as a legacy token otherwise',()=>{
  const shortSegment='a'.repeat(38)+'-Ab3x',legacy='Q'.repeat(38)+'-Ab3x';
  expect([...shareTokenHashesInBody({body:`${origin}/m/${shortSegment}`,origin})]).toEqual([hashShareToken({token:'Ab3x'})]);
  expect([...shareTokenHashesInBody({body:`${origin}/m/${legacy}`,origin})]).toEqual([hashShareToken({token:legacy})]);
 });
 it('review regression: recognizes a short link whose slug was edited out of shape (`_`, `.`, deleted) or with an upper-case host, so dispatch refuses it instead of revoking it',()=>{
  const tokenHash=hashShareToken({token:'Ab3x'});
  for(const body of [`Ver ${origin}/m/folleto_2027-Ab3x`,`Ver ${origin}/m/folleto.2027-Ab3x.`,`Ver ${origin}/m/Ab3x`,`Ver HTTPS://CRM.EXAMPLE.TEST/m/folleto-2027-Ab3x`,`<a href="${origin}/m/folleto_2027-Ab3x">${origin}/m/folleto_2027-Ab3x</a>`]){
   expect([...shareTokenHashesInBody({body,origin})],body).toEqual([tokenHash]);
   expect(shareSlugIntactInBody({body,tokenHash,publicSlug:'folleto-2027',origin}),body).toBe(body.includes('CRM.EXAMPLE.TEST'));
  }
  expect(shareUrlInBody({body:`Ver ${origin}/m/folleto.2027-Ab3x.`,tokenHash,origin})).toBe(`${origin}/m/folleto.2027-Ab3x`);
  expect(shareUrlInBody({body:'Ver HTTPS://CRM.EXAMPLE.TEST/m/Ab3x',tokenHash,origin})).toBe('HTTPS://CRM.EXAMPLE.TEST/m/Ab3x');
 });
 it('checks that a short link keeps its stored slug, ignoring case and accents',()=>{
  const tokenHash=hashShareToken({token:'Ab3x'});
  expect(shareSlugIntactInBody({body:`Ver ${short}`,tokenHash,publicSlug:'folleto-2027',origin})).toBe(true);
  expect(shareSlugIntactInBody({body:`Ver ${origin}/m/Folleto-2027-Ab3x`,tokenHash,publicSlug:'folleto-2027',origin})).toBe(true);
  expect(shareSlugIntactInBody({body:`Ver ${origin}/m/cabaña-Ab3x`,tokenHash,publicSlug:'cabana',origin})).toBe(true);
  expect(shareSlugIntactInBody({body:`Ver ${origin}/m/folleto-2028-Ab3x`,tokenHash,publicSlug:'folleto-2027',origin})).toBe(false);
  expect(shareSlugIntactInBody({body:`Ver ${urlA}`,tokenHash:hashShareToken({token:tokenA}),publicSlug:null,origin})).toBe(true);
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

describe('Instagram material (spec 98 §5.2)',()=>{
 it('maps a message to its material channel: email, WhatsApp, an Instagram attempt; never a «Red social» log or Hospeda\'s echo',()=>{
  expect(materialChannelOf({channel:'email'})).toBe('email');
  expect(materialChannelOf({channel:'whatsapp'})).toBe('whatsapp');
  expect(materialChannelOf({channel:'social',destinationDetail:'instagram',ownerEmail:'ana@hospeda.test'})).toBe('instagram');
  expect(materialChannelOf({channel:'social',destinationDetail:null,ownerEmail:'ana@hospeda.test'})).toBeNull();
  expect(materialChannelOf({channel:'social',destinationDetail:'instagram',ownerEmail:'instagram@hospeda'})).toBeNull();
  expect(materialChannelOf({channel:'call'})).toBeNull();
 });
 it('checks Instagram shares against the restrictions of `social`',()=>{
  expect(contactChannelOf('instagram')).toBe('social');expect(contactChannelOf('whatsapp')).toBe('whatsapp');expect(contactChannelOf('email')).toBe('email');
 });
 it('adds and removes the link as a plain-text line, like WhatsApp',()=>{
  expect(materialLinkSnippet({channel:'instagram',title:'Folleto',url:urlA})).toBe(`Podés ver «Folleto» en: ${urlA}`);
  const body=appendMaterialLink({channel:'instagram',body:'Hola Sol',title:'Folleto',url:urlA});
  expect(body).toBe(`Hola Sol\n\nPodés ver «Folleto» en: ${urlA}`);
  expect(removeMaterialLink({channel:'instagram',body,title:'Folleto',url:urlA})).toBe('Hola Sol');
  expect(appendMaterialLink({channel:'instagram',body:'',title:'Folleto',url:urlA})).toBe(`Podés ver «Folleto» en: ${urlA}`);
 });
 it('never attaches on Instagram and names the channel in the reason',()=>{
  const reasons=attachBlockReasons({channel:'instagram',limitBytes:10_000_000,items:[{id:'a',source:'file',fileName:'folleto.pdf',byteSize:1000,attach:false}]});
  expect(reasons.a).toBe('Instagram no adjunta archivos: va solo el enlace.');
  expect(attachBlockReasons({channel:'whatsapp',limitBytes:10_000_000,items:[{id:'a',source:'file',fileName:'folleto.pdf',byteSize:1000,attach:false}]}).a).toBe('WhatsApp no adjunta archivos: va solo el enlace.');
 });
});
