import React from 'react';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {describe,expect,it} from 'vitest';
import type {WorkTask} from '../endpoints/work.schema';
import {miniCalendarDays,TodayMiniCalendar} from './TodayMiniCalendar';

const task=(id:string,dueDate:string):WorkTask=>({id,accountId:'1',leadId:null,title:`Tarea ${id}`,description:null,typeId:'call',assignedUserEmail:null,dueDate,dueAt:null,priority:'media',status:'pending',result:null,completedAt:null,legacy:false,participants:'',contactIds:[],accountName:'Hotel Sol',city:null,opportunityName:null,deletedAt:null});
const renderCalendar=(tasks:WorkTask[])=>render(<MemoryRouter><TodayMiniCalendar tasks={tasks} now={new Date('2026-10-25T15:00:00Z')}/></MemoryRouter>);

describe('TodayMiniCalendar',()=>{
 it('puts Monday first when October 2026 starts on Thursday',()=>{const days=miniCalendarDays('2026-10');expect(days[0].date).toBe('2026-09-28');expect(days[0].day).toBe(28);expect(days[3].date).toBe('2026-10-01');expect(days[3].day).toBe(1);});
 it('shows up to three bucket-colored dots for a day',()=>{renderCalendar([task('1','2026-10-24'),task('2','2026-10-25'),task('3','2026-10-26'),task('4','2026-10-26')]);const overdue=screen.getByRole('button',{name:'24 de octubre, 1 tarea'}),today=screen.getByRole('button',{name:'25 de octubre, 1 tarea'}),upcoming=screen.getByRole('button',{name:'26 de octubre, 2 tareas'});expect(overdue.querySelectorAll('i')).toHaveLength(1);expect(overdue.querySelector('[data-bucket="overdue"]')).toBeTruthy();expect(today.querySelector('[data-bucket="today"]')).toBeTruthy();expect(upcoming.querySelectorAll('[data-bucket="upcoming"]')).toHaveLength(2);});
 it('uses singular and plural accessible labels, and omits the count when empty',()=>{renderCalendar([task('1','2026-10-25'),task('2','2026-10-25')]);expect(screen.getByRole('button',{name:'25 de octubre, 2 tareas'})).toBeTruthy();expect(screen.getByRole('button',{name:'24 de octubre'})).toBeTruthy();cleanup();renderCalendar([task('1','2026-10-25')]);expect(screen.getByRole('button',{name:'25 de octubre, 1 tarea'})).toBeTruthy();});
 it('selects a day, lists at most five tasks and toggles the list closed',()=>{renderCalendar(Array.from({length:7},(_,index)=>task(String(index+1),'2026-10-25')));const day=screen.getByRole('button',{name:'25 de octubre, 7 tareas'});fireEvent.click(day);expect(day.getAttribute('aria-pressed')).toBe('true');expect(screen.getAllByText(/Tarea \d · Hotel Sol/)).toHaveLength(5);expect(screen.getByText('y 2 más')).toBeTruthy();fireEvent.click(day);expect(screen.queryByText('y 2 más')).toBeNull();});
 it('shows the empty-day message when selected and navigates months',()=>{renderCalendar([]);fireEvent.click(screen.getByRole('button',{name:'24 de octubre'}));expect(screen.getByText('Sin tareas en esta lista.')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Mes anterior'}));expect(screen.getByText('septiembre de 2026')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Mes siguiente'}));expect(screen.getByText('octubre de 2026')).toBeTruthy();});
});
