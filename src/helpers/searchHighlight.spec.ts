import {describe,expect,it} from 'vitest';
import {findSearchMatch} from './searchHighlight';

const marked=(text:string,query:string)=>{const match=findSearchMatch({text,query});return match?text.slice(match.start,match.end):null};
describe('findSearchMatch',()=>{
 it('ignores accents in both directions and keeps the original characters',()=>{
  expect(marked('Hablamos de la ampliación del quincho','ampliacion')).toBe('ampliación');
  expect(marked('Hablamos de la ampliacion del quincho','AMPLIACIÓN')).toBe('ampliacion');
 });
 it('keeps ñ distinct from n',()=>{
  expect(marked('Pagó la seña ayer','sena')).toBeNull();
  expect(marked('Pagó la seña ayer','seña')).toBe('seña');
  expect(marked('Pagó la sena ayer','seña')).toBeNull();
 });
 it('maps decomposed input back to the source range',()=>{
  const text='Café y mañana';
  expect(marked(text,'cafe')).toBe('Café');
  expect(marked(text,'mañana')).toBe('mañana');
 });
 it('returns null for an empty query or no match',()=>{
  expect(findSearchMatch({text:'Hola',query:'  '})).toBeNull();
  expect(findSearchMatch({text:'Hola',query:'chau'})).toBeNull();
 });
 it('finds a match after an ellipsis prefix and leading spaces',()=>{
  const text='…  y el presupuesto llegó';
  const match=findSearchMatch({text,query:'llego'});
  expect(match&&text.slice(match.start,match.end)).toBe('llegó');
 });
 it('maps matches around and on emoji, including surrogate pairs and skin tones',()=>{
  expect(marked('Te mando 👍 y el precio','precio')).toBe('precio');
  expect(marked('Gracias 👍🏽 saludos','👍🏽')).toBe('👍🏽');
  expect(marked('🎉🎉 Ampliación lista','ampliacion')).toBe('Ampliación');
 });
 it('keeps a combining mark with its base letter when the match ends mid-cluster',()=>{
  expect(marked('Los cafe\u0301s de hoy','cafe')).toBe('cafe\u0301');
  expect(marked('Hasta man\u0303ana','man\u0303')).toBe('man\u0303');
  expect(marked('Hasta man\u0303ana','man')).toBeNull();
  expect(marked('Con e\u0301\u0302nfasis','enfasis')).toBe('e\u0301\u0302nfasis');
 });
 it('returns null when the query is empty after normalization',()=>{
  expect(findSearchMatch({text:'Café',query:'\u0301'})).toBeNull();
  expect(findSearchMatch({text:'Café',query:' \u0301\u0302 '})).toBeNull();
  expect(findSearchMatch({text:'',query:'cafe'})).toBeNull();
 });
});
