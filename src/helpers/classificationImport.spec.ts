import {describe,expect,it} from 'vitest';
import {parseClassificationImport} from './classificationImport';

describe('parseClassificationImport',()=>{
 it('splits pairs on semicolon and the first slash only',()=>{
  expect(parseClassificationImport(' Lodging/Hotel/Restaurant ; Gastronomy ')).toEqual([{tipo:'Lodging',subtipo:'Hotel/Restaurant'},{tipo:'Gastronomy',subtipo:null}]);
 });
 it('reads legacy scalar fields',()=>expect(parseClassificationImport(undefined,' Lodging ',' Hotel ')).toEqual([{tipo:'Lodging',subtipo:'Hotel'}]));
});
