// The in-app guide and the printable Markdown share one content source.
import {readFile, writeFile} from 'node:fs/promises';
const topics = JSON.parse(await readFile(new URL('../src/content/user-guide.json', import.meta.url), 'utf8'));
const lines = ['# Usar Hospeda, paso a paso', '', 'Guía para personas sin experiencia en CRM o ventas. Disponible en Más opciones → Guía de uso paso a paso. El contenido se mantiene en src/content/user-guide.json.', ''];
for (const topic of topics) {
  lines.push('## '+topic.title, '', topic.description, '');
  for (const article of topic.articles) {
    lines.push('### '+article.title, '', '**Cuándo usarlo:** '+article.when, '');
    article.steps.forEach((step, index) => lines.push(`${index+1}. ${step}`));
    lines.push('', '**Qué queda al terminar:** '+article.result, '');
    if(article.example.length) lines.push('**Ejemplo:**', '', ...article.example.map(line => '- '+line), '');
    if(article.notes.length) lines.push('**Tené en cuenta:**', '', ...article.notes.map(line => '- '+line), '');
    if(article.url) lines.push('**Dónde ir:** '+article.linkLabel+' ('+article.url+')', '');
  }
}
await writeFile(new URL('../docs/guia-de-uso.md', import.meta.url), lines.join('\n'));
