import {buildBadgeCard,buildPill,badgeTone,placeCard,type BadgeCardData} from './badgeCard';
import {cardData} from './badgeView';

const single=(over:Partial<Extract<BadgeCardData,{kind:'single'}>>={}):BadgeCardData=>({kind:'single',accountId:'12',code:'H12',name:'Cabañas del Río',city:'Colón',statusLabel:'Contactado',assignedUserName:'Ana',blocked:false,openManagement:{stageLabel:'Primer contacto',typeLabel:'Partner'},...over});
const card=(data:BadgeCardData)=>buildBadgeCard({doc:document,base:'https://crm.test',data});
const text=(node:HTMLElement,selector:string)=>[...node.querySelectorAll(selector)].map(n=>n.textContent);

describe('shared badge card',()=>{
 it('single: header, status chip, owner, management and the «Abrir en el CRM» button',()=>{
  // Arrange & Act
  const c=card(single());
  // Assert
  expect(c.querySelector('.head .code')!.textContent).toBe('H12');expect(c.querySelector('.head .name')!.textContent).toBe('Cabañas del Río');expect(c.querySelector('.head .city')!.textContent).toBe('Colón');
  expect(text(c,'.chip')).toEqual(['Contactado']);expect(text(c,'.kv')).toEqual(['ResponsableAna','GestiónPrimer contacto · Partner']);
  const link=c.querySelector<HTMLAnchorElement>('a.btn')!;expect(link.textContent).toBe('Abrir en el CRM');expect(link.href).toBe('https://crm.test/accounts/12');expect(link.target).toBe('_blank');expect(link.rel).toBe('noopener noreferrer');
 });
 it('single without management or owner, and the WhatsApp line only when given',()=>{
  const c=card(single({openManagement:null,assignedUserName:null,city:null,lastWhatsapp:'1/10/2026, 10:00:00'}));
  expect(text(c,'.kv')).toEqual(['ResponsableSin responsable','GestiónSin gestión abierta','Último WhatsApp1/10/2026, 10:00:00']);expect(c.querySelector('.city')!.textContent).toBe('Sin ciudad');
  expect(card(single({accountId:undefined})).querySelector('a')).toBeNull();
 });
 it('red: «No contactar» as a red chip and a red pill',()=>{
  const data=single({blocked:true}),c=card(data);
  expect(c.querySelector('.chip.danger')!.textContent).toBe('No contactar');expect(badgeTone(data)).toBe('red');
  expect(buildPill({doc:document,tone:badgeTone(data),text:'H12'}).className).toBe('pill red');
 });
 it('multiple: a list of businesses, each linking to its account when the id is known',()=>{
  const data:BadgeCardData={kind:'multiple',businesses:[{accountId:'1',code:'H1',name:'Uno',statusLabel:null},{code:'H2',name:'Dos',statusLabel:'Cliente'}]},c=card(data);
  expect(c.querySelector('.lead')!.textContent).toBe('2 negocios del CRM coinciden con este chat');
  expect(text(c,'.item')).toEqual(['H1UnoSin estado','H2DosCliente']);expect(c.querySelector<HTMLAnchorElement>('a.item')!.href).toBe('https://crm.test/accounts/1');expect(c.querySelectorAll('a')).toHaveLength(1);expect(badgeTone(data)).toBe('amber');
 });
 it('none: a short message, no link, dashed pill',()=>{
  const c=card({kind:'none'});expect(c.textContent).toContain('Sin asociar al CRM');expect(c.querySelector('a')).toBeNull();expect(badgeTone({kind:'none'})).toBe('none');
 });
 it('never uses innerHTML and keeps markup in names as text',()=>{
  const setter=vi.spyOn(Element.prototype,'innerHTML','set');
  try{const c=card(single({name:'<img src=x onerror=alert(1)>'}));expect(setter).not.toHaveBeenCalled();expect(c.querySelector('img')).toBeNull();expect(c.querySelector('.name')!.textContent).toBe('<img src=x onerror=alert(1)>');}finally{setter.mockRestore();}
 });
 it('a click on a card link does not bubble',()=>{
  const c=card(single()),outer=vi.fn();document.body.append(c);document.body.addEventListener('click',outer);const link=c.querySelector<HTMLAnchorElement>('a.btn')!;link.addEventListener('click',event=>event.preventDefault());
  link.click();expect(outer).not.toHaveBeenCalled();document.body.removeEventListener('click',outer);c.remove();
 });
 it('places the card to the right, or flips it to the left near the viewport edge',()=>{
  const c=card(single()),view={innerWidth:1000,innerHeight:800} as Window;
  placeCard({card:c,anchor:new DOMRect(100,100,60,20),view});expect(c.style.left).toBe('168px');expect(c.classList.contains('left')).toBe(false);
  placeCard({card:c,anchor:new DOMRect(800,780,60,20),view});expect(c.style.left).toBe(`${800-8-312}px`);expect(c.classList.contains('left')).toBe(true);expect(c.style.top).toBe(`${800-8-220}px`);
 });
 it('maps WhatsApp badges: restriction is red, missing fields fall back',()=>{
  expect(cardData({key:'k',kind:'single',accountId:'5',code:'H5',restricted:true})).toMatchObject({kind:'single',accountId:'5',blocked:true,name:'',city:null,lastWhatsapp:null});
  expect(cardData({key:'k',kind:'none'})).toEqual({kind:'none'});expect(cardData({key:'k',kind:'multiple'})).toEqual({kind:'multiple',businesses:[]});
 });
});
