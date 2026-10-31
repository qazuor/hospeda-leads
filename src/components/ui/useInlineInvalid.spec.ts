import {describe,expect,it} from 'vitest';
import {invalidMessage} from './useInlineInvalid';

const field=(type:string,attrs:Partial<HTMLInputElement>,validity:Partial<ValidityState>)=>({type,min:'',max:'',validationMessage:'',...attrs,validity:{valid:false,...validity}}) as unknown as HTMLInputElement;

describe('invalidMessage: dates and times in Argentine format (spec 104 §3.10)',()=>{
 it('shows the datetime maximum as dd/mm/aaaa hh:mm, never the ISO value',()=>{
  expect(invalidMessage(field('datetime-local',{max:'2026-10-31T14:05'},{rangeOverflow:true}))).toBe('No puede ser posterior a 31/10/2026 14:05.');
 });
 it('shows date and time limits readably',()=>{
  expect(invalidMessage(field('date',{max:'2026-10-31'},{rangeOverflow:true}))).toBe('No puede ser posterior a 31/10/2026.');
  expect(invalidMessage(field('date',{min:'2026-10-01'},{rangeUnderflow:true}))).toBe('No puede ser anterior a 01/10/2026.');
  expect(invalidMessage(field('time',{max:'14:05'},{rangeOverflow:true}))).toBe('No puede ser posterior a las 14:05.');
 });
 it('keeps numeric limits as they were',()=>{
  expect(invalidMessage(field('number',{max:'5'},{rangeOverflow:true}))).toBe('El valor máximo es 5.');
 });
 it('uses the Spanish custom message a control set with setCustomValidity',()=>{
  expect(invalidMessage(field('text',{validationMessage:'No puede ser posterior a hoy 14:05.'},{customError:true}))).toBe('No puede ser posterior a hoy 14:05.');
 });
});
