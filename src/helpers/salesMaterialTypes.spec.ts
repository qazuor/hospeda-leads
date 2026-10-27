import {describe,expect,it} from 'vitest';
import {SALES_MATERIAL_ACCEPT,contentDisposition,externalUrlError,fileExtension,formatBytes,mimeForFile,salesMaterialFormat,salesMaterialObjectKey,signatureMatches,uploadDeclarationError} from './salesMaterialTypes';

const bytes=(...parts:(string|number[])[])=>{const out:number[]=[];for(const p of parts)out.push(...(typeof p==='string'?[...p].map(c=>c.charCodeAt(0)):p));while(out.length<16)out.push(0);return new Uint8Array(out);};
describe('uploadDeclarationError',()=>{
 it('accepts allowed types whose extension matches, up to the limit',()=>{
  expect(uploadDeclarationError({purpose:'file',fileName:'Folleto.PDF',mimeType:'application/pdf',byteSize:1})).toBeNull();
  expect(uploadDeclarationError({purpose:'file',fileName:'video.mov',mimeType:'video/quicktime',byteSize:524288000})).toBeNull();
  expect(uploadDeclarationError({purpose:'cover',fileName:'tapa.webp',mimeType:'image/webp',byteSize:1048576})).toBeNull();
 });
 it('rejects unknown types, mismatched extensions, non-image covers and sizes out of range',()=>{
  expect(uploadDeclarationError({purpose:'file',fileName:'a.exe',mimeType:'application/x-msdownload',byteSize:10})).toBe('Ese tipo de archivo no está permitido.');
  expect(uploadDeclarationError({purpose:'file',fileName:'a.pdf',mimeType:'image/png',byteSize:10})).toBe('La extensión del archivo no coincide con su tipo.');
  expect(uploadDeclarationError({purpose:'cover',fileName:'a.pdf',mimeType:'application/pdf',byteSize:10})).toBe('La portada tiene que ser una imagen.');
  expect(uploadDeclarationError({purpose:'file',fileName:'a.pdf',mimeType:'application/pdf',byteSize:0})).toBe('El archivo está vacío.');
  expect(uploadDeclarationError({purpose:'file',fileName:'a.mp4',mimeType:'video/mp4',byteSize:524288001})).toBe('El archivo supera el límite de 500 MB.');
  expect(uploadDeclarationError({purpose:'cover',fileName:'a.png',mimeType:'image/png',byteSize:1048577})).toBe('El archivo supera el límite de 1 MB.');
  expect(uploadDeclarationError({purpose:'file',fileName:'a.png',mimeType:'image/png',byteSize:2000,maxUploadBytes:1000})).toMatch(/límite/);
 });
});
describe('signatureMatches',()=>{
 it.each([
  ['application/pdf',bytes('%PDF-1.7')],['image/png',bytes([137,80,78,71,13,10,26,10])],['image/jpeg',bytes([0xff,0xd8,0xff,0xe0])],['image/gif',bytes('GIF89a')],
  ['image/webp',bytes('RIFF',[1,2,3,4],'WEBP')],['video/mp4',bytes([0,0,0,24],'ftypisom')],['video/quicktime',bytes([0,0,0,20],'ftypqt  ')],['audio/mp4',bytes([0,0,0,24],'ftypM4A ')],
  ['video/webm',bytes([0x1a,0x45,0xdf,0xa3])],['audio/mpeg',bytes('ID3')],['audio/mpeg',bytes([0xff,0xfb,0x90])],['audio/ogg',bytes('OggS')],['audio/wav',bytes('RIFF',[1,2,3,4],'WAVE')],
  ['application/vnd.openxmlformats-officedocument.presentationml.presentation',bytes('PK',[3,4])],['application/msword',bytes([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1])]
 ] as const)('accepts %s',(mimeType,b)=>expect(signatureMatches({mimeType,bytes:b})).toBe(true));
 it('rejects content that does not match its declared type',()=>{
  expect(signatureMatches({mimeType:'application/pdf',bytes:bytes([137,80,78,71])})).toBe(false);
  expect(signatureMatches({mimeType:'image/webp',bytes:bytes('RIFF',[1,2,3,4],'WAVE')})).toBe(false);
  expect(signatureMatches({mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',bytes:bytes('%PDF-')})).toBe(false);
  expect(signatureMatches({mimeType:'text/html',bytes:bytes('<html>')})).toBe(false);
  expect(signatureMatches({mimeType:'application/pdf',bytes:new Uint8Array()})).toBe(false);
 });
});
describe('keys, names and formats',()=>{
 it('builds the R2 object keys of spec 89',()=>{
  expect(salesMaterialObjectKey({purpose:'file',materialId:'m-1',version:3,uuid:'u-1',extension:'PDF'})).toBe('materials/m-1/v3-u-1.pdf');
  expect(salesMaterialObjectKey({purpose:'cover',materialId:'m-1',version:3,uuid:'u-2',extension:'.png'})).toBe('covers/m-1/u-2.png');
 });
 it('encodes Content-Disposition with an ASCII fallback and RFC 5987 name',()=>{
  expect(contentDisposition({disposition:'inline',fileName:null})).toBe('inline');
  expect(contentDisposition({disposition:'attachment',fileName:'Año "nuevo".pdf'})).toBe(`attachment; filename="A_o _nuevo_.pdf"; filename*=UTF-8''A%C3%B1o%20%22nuevo%22.pdf`);
  expect(contentDisposition({disposition:'attachment',fileName:"o'(x).pdf"})).toContain("filename*=UTF-8''o%27%28x%29.pdf");
 });
 it('formats sizes, extensions, formats and the accept list',()=>{
  expect(formatBytes({bytes:10})).toBe('1 KB');expect(formatBytes({bytes:1536*1024})).toBe('1,5 MB');expect(formatBytes({bytes:524288000})).toBe('500 MB');
  expect(fileExtension({fileName:'a.b.JPEG'})).toBe('jpeg');expect(fileExtension({fileName:'.env'})).toBe('');
  expect(salesMaterialFormat({mimeType:null})).toBe('link');expect(salesMaterialFormat({mimeType:'audio/ogg'})).toBe('audio');expect(salesMaterialFormat({mimeType:'application/vnd.ms-excel'})).toBe('office');
  expect(SALES_MATERIAL_ACCEPT).toContain('.pptx');expect(SALES_MATERIAL_ACCEPT).toContain('video/quicktime');
 });
 it('infers the MIME type from the extension when the browser leaves it empty or vendor-specific',()=>{
  expect(mimeForFile({fileName:'a.m4a',type:'audio/x-m4a'})).toBe('audio/mp4');
  expect(mimeForFile({fileName:'a.docx',type:''})).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  expect(mimeForFile({fileName:'a.png',type:'image/png'})).toBe('image/png');
  expect(mimeForFile({fileName:'a.exe',type:'application/octet-stream'})).toBeNull();
 });
 it('accepts only https URLs without credentials',()=>{
  expect(externalUrlError({url:'https://example.com/a'})).toBeNull();
  expect(externalUrlError({url:'http://example.com'})).toBe('Solo se aceptan enlaces https://.');
  expect(externalUrlError({url:'https://u:p@example.com'})).toBe('El enlace no puede incluir usuario ni contraseña.');
  expect(externalUrlError({url:'javascript:alert(1)'})).toBe('Solo se aceptan enlaces https://.');
  expect(externalUrlError({url:'no es url'})).toMatch(/dirección web completa/);
 });
});
