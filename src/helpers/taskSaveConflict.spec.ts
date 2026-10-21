import {describe,expect,it} from 'vitest';
import {sameTaskVersion,taskAlreadySaved,taskVersion,type TaskEditableFields} from './taskSaveConflict';
const stored:TaskEditableFields={title:'Llamar',purpose:'commercial',description:'',typeId:'call',assignedUserEmail:'marta@example.com',dueDate:new Date('2027-01-15T00:00:00Z'),dueAt:new Date('2027-01-15T13:00:00Z'),priority:'media',participants:'',contactIds:['4']};
describe('task save concurrency',()=>{
 it('round-trips the version token with millisecond precision',()=>{
  const updatedAt=new Date('2026-10-21T15:04:05.123Z');
  expect(taskVersion(updatedAt)).toBe('2026-10-21T15:04:05.123Z');
  expect(sameTaskVersion(updatedAt,taskVersion(updatedAt)!)).toBe(true);
  expect(sameTaskVersion(updatedAt,'2026-10-21T15:04:05.124Z')).toBe(false);
  expect(taskVersion(null)).toBeUndefined();
 });
 it('recognises a retry that the first attempt already applied',()=>{
  expect(taskAlreadySaved({stored,requested:{...stored,dueDate:'2027-01-15',dueAt:new Date('2027-01-15T10:00:00-03:00'),contactIds:['4']}})).toBe(true);
 });
 it('treats any different editable field as a real conflict',()=>{
  for(const change of [{title:'Visitar'},{purpose:null},{description:'Otra nota'},{typeId:'visit'},{assignedUserEmail:null},{dueDate:'2027-01-16'},{dueAt:null},{priority:'alta'},{participants:'Ana'},{contactIds:[]}] as const)
   expect(taskAlreadySaved({stored,requested:{...stored,...change}}),JSON.stringify(change)).toBe(false);
 });
});
