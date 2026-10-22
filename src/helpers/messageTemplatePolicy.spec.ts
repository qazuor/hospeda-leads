import {describe,expect,it} from 'vitest';
import {templateCompatibility} from './messageTemplatePolicy';

describe('template vertical compatibility',()=>{
  const template={channel:'email',vertical:'Alojamiento'};
  it('matches canonical known singular, plural, accent and case variants',()=>{
    for(const vertical of ['Alojamientos','ALOJAMIENTO','Alojamíentos'])expect(templateCompatibility(template,{channel:'email',vertical})).toBeNull();
  });
  it('keeps ñ distinct from n',()=>{
    expect(templateCompatibility({...template,vertical:'Cabaña'},{channel:'email',vertical:'Cabana'})).toContain('Cabaña');
  });
});
