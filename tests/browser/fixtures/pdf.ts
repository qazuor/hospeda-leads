/** Small valid PDF with two distinct pages, including a real cross-reference table. */
export function twoPagePdf(){
 const stream=(text:string)=>{const content=`BT /F1 24 Tf 40 300 Td (${text}) Tj ET`;return `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;};
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',...['5','6'].map(id=>`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 500] /Resources << /Font << /F1 7 0 R >> >> /Contents ${id} 0 R >>`),stream('Primera pagina'),stream('Segunda pagina'),'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 let pdf='%PDF-1.7\n';const offsets=[0];objects.forEach((object,index)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${index+1} 0 obj\n${object}\nendobj\n`;});const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 8\n0000000000 65535 f \n${offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return Buffer.from(pdf);
}
/** Assembles a PDF from object bodies (strings or bytes) with a correct cross-reference table; object N is `objects[N-1]`. */
function assemble(objects:(string|Buffer)[]):Buffer{
 const parts:Buffer[]=[Buffer.from('%PDF-1.7\n')];let size=parts[0]!.length;const offsets:number[]=[];
 objects.forEach((object,index)=>{offsets.push(size);const chunk=Buffer.concat([Buffer.from(`${index+1} 0 obj\n`),typeof object==='string'?Buffer.from(object):object,Buffer.from('\nendobj\n')]);parts.push(chunk);size+=chunk.length;});
 parts.push(Buffer.from(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${size}\n%%EOF`));
 return Buffer.concat(parts);
}
/**
 * Spec 102: synthetic print-style PDF: a CMYK image (DeviceCMYK, which pdf.js colour-manages with its ICC profile and wasm when they are
 * configured) and text in standard fonts that are not embedded: Times-Roman (a browser falls back to a system font) and Symbol, whose glyphs
 * pdf.js always loads from its own standard font files (`FoxitSymbol.pfb`), so drawing this cover reliably requests a pdf.js asset.
 * A few hundred bytes, no real customer file.
 */
export function cmykImagePdf(){
 const width=8,height=8;const pixels=Buffer.alloc(width*height*4);for(let i=0;i<width*height;i++)pixels.set(i%2?[0,200,255,0]:[255,0,0,40],i*4);
 const content='q 300 0 0 300 50 120 cm /Im1 Do Q BT /F1 24 Tf 50 60 Td (Folleto CMYK) Tj ET BT /F2 18 Tf 50 30 Td (abg) Tj ET';
 return assemble(['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 500] /Resources << /Font << /F1 5 0 R /F2 7 0 R >> /XObject << /Im1 6 0 R >> >> /Contents 4 0 R >>',
  `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>',
  Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceCMYK /BitsPerComponent 8 /Length ${pixels.length} >>\nstream\n`),pixels,Buffer.from('\nendstream')]),'<< /Type /Font /Subtype /Type1 /BaseFont /Symbol >>']);
}
/** Spec 102: bytes that start like a PDF (the server accepts the signature) but pdf.js cannot read. */
export function brokenPdf(){return Buffer.from('%PDF-1.7\nthis is not a real PDF body\n%%EOF');}
/** A real 1×1 PNG, small enough to be a manual cover. */
export function tinyPng(){return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');}
