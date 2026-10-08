import {describe,it,expect} from 'vitest';
import {templateCompatibility} from './messageTemplatePolicy';

describe('message template segmentation',()=>{
  it.each(['email','whatsapp'])('allows Referente models through %s',channel=>{
    expect(templateCompatibility({channel,commercialProfile:'Referente'},{channel,commercialProfile:'Referente'})).toBeNull();
  });
  it('allows general models and unknown management values without relaxing known values',()=>{
    const scoped={channel:'whatsapp',vertical:'Gastronomía',commercialProfile:'Referente'};
    expect(templateCompatibility(scoped,{channel:'whatsapp'})).toBeNull();
    expect(templateCompatibility(scoped,{channel:'whatsapp',vertical:'Gastronomía'})).toBeNull();
    expect(templateCompatibility(scoped,{channel:'whatsapp',vertical:'Alojamientos'})).toContain('vertical');
    expect(templateCompatibility(scoped,{channel:'whatsapp',commercialProfile:'Consolidado'})).toContain('perfil');
    expect(templateCompatibility(scoped,{channel:'email'})).toContain('canal');
    expect(templateCompatibility({channel:'email'},{channel:'email',vertical:'Gastronomía',commercialProfile:'Referente'})).toBeNull();
  });
  it('treats blank scopes as unset but does not invent classification aliases',()=>{
    expect(templateCompatibility({channel:'email',vertical:' ',commercialProfile:' '},{channel:'email',vertical:'Alojamientos',commercialProfile:'Referente'})).toBeNull();
    expect(templateCompatibility({channel:'email',vertical:'Alojamiento'},{channel:'email',vertical:'Alojamientos'})).toContain('vertical');
  });
});
