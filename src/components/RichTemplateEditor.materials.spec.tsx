import React from 'react';
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {RichTemplateEditor} from './RichTemplateEditor';

vi.mock('./SalesMaterialPicker',()=>({SalesMaterialPicker:({opened,onPick,title}:{opened:boolean;onPick:(m:{id:string;title:string})=>void;title:string})=>opened?<div role="dialog" aria-label={title}><button type="button" onClick={()=>onPick({id:'33333333-3333-4333-8333-333333333333',title:'Tour 360'})}>Elegir Tour 360</button></div>:null}));
beforeAll(()=>{
 window.matchMedia=window.matchMedia||((query:string)=>({matches:false,media:query,addEventListener:()=>{},removeEventListener:()=>{},addListener:()=>{},removeListener:()=>{},dispatchEvent:()=>false,onchange:null}) as MediaQueryList);
 window.ResizeObserver=window.ResizeObserver||class{observe(){}unobserve(){}disconnect(){}};
 const rect=()=>({x:0,y:0,top:0,left:0,right:0,bottom:0,width:0,height:0,toJSON:()=>({})}) as DOMRect;
 Range.prototype.getBoundingClientRect=rect;Range.prototype.getClientRects=()=>({length:0,item:()=>null,[Symbol.iterator]:function*(){}}) as unknown as DOMRectList;
 document.elementFromPoint=()=>null;
});
afterEach(()=>{cleanup();vi.clearAllMocks();});

const folleto='11111111-1111-4111-8111-111111111111';
const show=(props:Partial<React.ComponentProps<typeof RichTemplateEditor>>={})=>render(<MantineProvider><RichTemplateEditor value={`<p>Hola {{material:${folleto}}}</p>`} onChange={()=>{}} channel="whatsapp" showVariables={false} {...props}/></MantineProvider>);

describe('RichTemplateEditor sales material references (spec 89 §9)',()=>{
 it('shows a stored reference as a chip with the title, never the uuid',async()=>{
  show({salesMaterials:{titles:{[folleto]:'Folleto 2027'}}});
  const editor=await screen.findByRole('textbox',{name:'Contenido del modelo'});
  await waitFor(()=>expect(editor.textContent).toContain('[Material: Folleto 2027]'));
  expect(editor.textContent).not.toContain(folleto);
 });
 it('inserts a picked material and stores it as {{material:<uuid>}}',async()=>{
  const onChange=vi.fn(),onInsert=vi.fn();
  show({onChange,salesMaterials:{titles:{[folleto]:'Folleto 2027'},onInsert}});
  await screen.findByRole('textbox',{name:'Contenido del modelo'});
  fireEvent.click(screen.getByRole('button',{name:'Insertar material de venta'}));
  fireEvent.click(screen.getByRole('button',{name:'Elegir Tour 360'}));
  await waitFor(()=>expect(onChange).toHaveBeenCalled());
  const stored=onChange.mock.calls.at(-1)![0] as string;
  expect(stored).toContain('{{material:33333333-3333-4333-8333-333333333333}}');
  expect(stored).toContain(`{{material:${folleto}}}`);
  expect(stored).not.toContain('data-sales-material');
  expect(onInsert).toHaveBeenCalledWith({id:'33333333-3333-4333-8333-333333333333',title:'Tour 360'});
  expect(screen.getByRole('textbox',{name:'Contenido del modelo'}).textContent).toContain('[Material: Tour 360]');
 });
 it('offers no material button outside the template editor',async()=>{
  show();
  await screen.findByRole('textbox',{name:'Contenido del modelo'});
  expect(screen.queryByRole('button',{name:'Insertar material de venta'})).toBeNull();
 });
});
