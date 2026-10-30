// @vitest-environment node
import {describe,expect,it,vi} from 'vitest';
vi.mock('./db',()=>({db:{}}));
const {whatsappBlockReason,whatsappGeneralPeople}=await import('./userscriptWhatsappTemplates');

describe('WhatsApp «Sin gestión» people (spec 98 decision 4)',()=>{
 it('without people with a phone, goes to the business WhatsApp or phone',()=>{
  expect(whatsappGeneralPeople({contacts:[{id:1,name:'Sin tel',phone:null,isPrimary:true}],eligibleIds:[],accountPhone:'+54 9 3442 45-3797'})).toEqual({contacts:[],businessPhone:'+54 9 3442 45-3797'});
 });
 it('with people with a phone, one must be chosen: only those without a restriction, the primary one by default, never the business phone',()=>{
  const contacts=[{id:1,name:'Ana',phone:'+5491111',isPrimary:false},{id:2,name:'Beto',phone:'+5492222',isPrimary:true},{id:3,name:'Ceci',phone:'+5493333',isPrimary:false}];
  expect(whatsappGeneralPeople({contacts,eligibleIds:['1','2'],accountPhone:'+5490000'})).toEqual({businessPhone:null,contacts:[{id:'1',name:'Ana',phone:'+5491111',default:false},{id:'2',name:'Beto',phone:'+5492222',default:true}]});
  expect(whatsappGeneralPeople({contacts,eligibleIds:['3'],accountPhone:null})?.contacts).toEqual([{id:'3',name:'Ceci',phone:'+5493333',default:true}]);
 });
 it('is null when nobody can receive it (every person restricted, or no phone at all)',()=>{
  expect(whatsappGeneralPeople({contacts:[{id:1,name:'Ana',phone:'+5491111',isPrimary:true}],eligibleIds:[],accountPhone:'+5490000'})).toBeNull();
  expect(whatsappGeneralPeople({contacts:[],eligibleIds:[],accountPhone:'  '})).toBeNull();
 });
});

describe('WhatsApp panel block reason',()=>{
 it('No contactar first, then nothing to prepare (Nuevo explains the verification); «Sin gestión» unblocks a business without managements',()=>{
  expect(whatsappBlockReason({status:'contacted',doNotContact:true,leads:2,general:true})).toBe('El negocio tiene No contactar activo.');
  expect(whatsappBlockReason({status:'new',doNotContact:false,leads:0,general:false})).toBe('En estado Nuevo solo se permite el contacto general de verificación.');
  expect(whatsappBlockReason({status:'contacted',doNotContact:false,leads:0,general:false})).toBe('No hay gestiones abiertas que puedas modificar.');
  expect(whatsappBlockReason({status:'new',doNotContact:false,leads:0,general:true})).toBeNull();
  expect(whatsappBlockReason({status:'contacted',doNotContact:false,leads:1,general:false})).toBeNull();
 });
});
