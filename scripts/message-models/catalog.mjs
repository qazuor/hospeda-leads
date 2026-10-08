import {readFileSync} from 'node:fs';
export const baseline=JSON.parse(readFileSync(new URL('./baseline.json',import.meta.url),'utf8'));
// These aliases are only for this reviewed catalog, never a global classification rule.
export const verticalAliases={Alojamiento:'Alojamientos',Experiencia:'Experiencias',Partner:'Partners','Proveedor de servicios':'Proveedores de servicios'};
const benefits={
 Alojamiento:'La propuesta busca dar visibilidad al alojamiento y facilitar el contacto directo con quienes planifican una visita a la región.',
 Gastronomía:'La propuesta busca ayudar a que los visitantes descubran el establecimiento, conozcan su oferta gastronómica y accedan a sus canales de contacto.',
 Experiencia:'La propuesta busca ayudar a que los visitantes descubran la actividad y contacten directamente con quienes la ofrecen.',
 Partner:'Nos gustaría explorar una colaboración para difundir propuestas locales y acercar información útil a quienes visitan la región.',
 'Proveedor de servicios':'Nos gustaría presentarles la propuesta para conectar prestadores con alojamientos y otros negocios turísticos que necesitan sus servicios.',
 Editor:'Nos gustaría explorar una colaboración editorial para compartir contenido útil sobre destinos, gastronomía, cultura y actividades de la región.'
};
const profiles=['Independiente','Consolidado','Referente'];
function copy(vertical,profile,channel){
 const formal=profile!=='Independiente';
 const greeting=formal?'{{#if contact}}Hola {{contact}}, ¿cómo está?{{else}}Hola, ¿cómo están?{{/if}}':'{{#if contact}}Hola {{contact}}, ¿cómo estás?{{else}}Hola, ¿cómo estás?{{/if}}';
 const intro=`${channel==='whatsapp'&&!formal?'Soy {{sender_short}}':'Mi nombre es {{sender}}'}, de Hospeda, una plataforma turística del Litoral Entrerriano.`;
 const invitation=formal?'Les escribo para presentarles una propuesta de participación para {{name}}{{#if city}}, en {{city}}{{/if}}.':'Te escribo para invitar a {{name}}{{#if city}}, en {{city}}{{/if}}, a conocer la propuesta.';
 const close=profile==='Referente'?'¿Con quién podríamos coordinar una breve presentación?':formal?'¿Les interesa que les comparta más información?':'¿Te interesa que te cuente cómo funciona?';
 const paragraphs=[greeting,intro,invitation,benefits[vertical],close];
 return {
  subject:channel==='email'?`${['Partner','Editor'].includes(vertical)?'Propuesta de colaboración':'Invitación a Hospeda'} · {{name}}`:null,
  body:channel==='email'?paragraphs.map(p=>`<p>${p}</p>`).join(''):paragraphs.join('\n\n')
 };
}
export function resolveVertical(vertical,active){
 const choices=[vertical,verticalAliases[vertical]].filter(v=>v&&active.includes(v));
 if(choices.length!==1)throw new Error(`Vertical ${vertical}: se necesita una única clasificación activa; encontradas ${choices.join(', ')||'ninguna'}.`);
 return choices[0];
}
export function catalog(active){
 return Object.keys(benefits).flatMap(vertical=>profiles.flatMap(profile=>['email','whatsapp'].map(channel=>{
  const original=baseline.find(m=>m.vertical===vertical&&m.commercial_profile===profile&&m.channel===channel);
  const resolved=resolveVertical(vertical,active);
  return {id:original?.id??null,channel,name:`Primer contacto · ${resolved} · ${profile} · ${channel==='email'?'Email':'WhatsApp'}`,vertical:resolved,commercial_profile:profile,...copy(vertical,profile,channel)};
 })));
}
