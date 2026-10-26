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
});
