import {describe,expect,it} from 'vitest';
import {GLOSSARY} from './glossary';
import {VOCAB,managementDisplayName,plural} from './vocabulary';

describe('vocabulary',()=>{
 it('holds the owner approved words (decision 6d)',()=>{
  expect(VOCAB).toMatchObject({business:'Negocio',person:'Persona',management:'Gestión',contact:'Contactar',scheduleTask:'Agendar tarea',logWhatHappened:'Anotar lo que pasó',logOutcome:'Anotar cómo salió',howDidItGo:'¿Cómo salió?',whatsNext:'¿Cómo sigue?',businessOwner:'Responsable del negocio',managementOwner:'Responsable de la gestión',assignedTo:'Asignada a',deleteMistake:'Borrar (cargada por error)',noLongerNeeded:'Ya no hace falta',noTaskScheduled:'Sin tarea agendada'});
 });

 it('pluralizes counts',()=>{
  expect(plural(1,'gestión','gestiones')).toBe('1 gestión');
  expect(plural(0,'gestión','gestiones')).toBe('0 gestiones');
  expect(plural(2,'persona','personas')).toBe('2 personas');
 });

 it('names a management without exposing ids',()=>{
  expect(managementDisplayName({opportunityName:'  Plan anual  '})).toBe('Plan anual');
  // 02:30 UTC on the 4th is still the 3rd in Argentina.
  expect(managementDisplayName({opportunityName:null,createdAt:'2026-10-04T02:30:00Z'})).toMatch(/^Gestión sin nombre \(iniciada el 3 (de )?oct\.? (de )?2026\)$/);
  expect(managementDisplayName({opportunityName:'',createdAt:new Date('invalid')})).toBe('Gestión sin nombre');
  expect(managementDisplayName({})).toBe('Gestión sin nombre');
 });

 it('defines every glossary term in one sentence',()=>{
  expect(Object.keys(GLOSSARY)).toEqual(['status','stage','management','nextStep','managementType','doNotContact']);
  for(const entry of Object.values(GLOSSARY))expect(entry.definition.trim().length,entry.term).toBeGreaterThan(30);
 });
});
