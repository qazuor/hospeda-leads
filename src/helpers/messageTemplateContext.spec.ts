import {buildMessageTemplateContext} from './messageTemplateContext';
import {renderMessageTemplate,renderMessageTemplateHtml,htmlToPlainText} from './renderMessageTemplate';
import {defaultMessageVariableSettings} from './messageVariables';
import {resolveMessageVariables} from './messageVariables';

describe('shared template context',()=>{
 it('uses every business vertical and subtype for D9, while management context stays singular',()=>{
  const business=buildMessageTemplateContext({accountId:'1',verticals:['Alojamiento','Gastronomía'],subtypes:['Hotel','Restaurante']});
  expect(business.type).toBe('Alojamiento y Gastronomía');expect(business.subtype).toBe('Hotel y Restaurante');
  const management=buildMessageTemplateContext({accountId:'1',type:'Alojamiento',subtype:'Hotel',verticals:['Alojamiento'],subtypes:['Hotel']});
  expect(management.type).toBe('Alojamiento');expect(management.subtype).toBe('Hotel');
 });
 it('uses singular legacy type and subtype fields as condition lists',()=>{
  const definitions=[{key:'choice',label:'Choice',description:'',source:{kind:'text' as const,key:''},active:true,alternatives:[{id:'vertical',text:'vertical match',conditions:{verticals:['Gastronomía']}},{id:'subtype',text:'subtype match',conditions:{businessType:'Restaurante'}}]}];
  expect(resolveMessageVariables(buildMessageTemplateContext({accountId:'1',type:'Gastronomía'}),definitions).choice).toBe('vertical match');
  expect(resolveMessageVariables(buildMessageTemplateContext({accountId:'1',subtype:'Restaurante'}),definitions).choice).toBe('subtype match');
 });
 it('keeps the client preview and communication service HTML render text identical for the same inputs and picks',()=>{
  const input={accountId:'42',contactId:'7',name:'Posada Sol',contact:'Ana Pérez',city:'Colón',type:'Alojamiento',subtype:'Hotel',phone:'+5493442000000',email:'ana@example.com',website:'https://example.com',sender:'Leandro',senderShort:'Leo',senderEmail:'leo@example.com',commercialProfile:'Referente',isClient:true,channel:'whatsapp',purpose:'first_contact' as const,variation:2,previousPicks:{saludo:'saludo-formal'},now:new Date('2026-10-19T15:00:00.000Z')};
  const template='<p>{{saludo}} {{contact_first}}. Te escribo de {{sender}} ({{sender_email}}).</p><p>{{firma}}</p>';
  const preview=htmlToPlainText(renderMessageTemplate(template,buildMessageTemplateContext(input),defaultMessageVariableSettings()));
  const serverHtml=renderMessageTemplateHtml(template,buildMessageTemplateContext(input),defaultMessageVariableSettings());
  expect(htmlToPlainText(serverHtml)).toBe(preview);
 });
 it('keeps a no-management two-vertical client preview and server render identical',()=>{
  const input={accountId:'42',name:'Negocio',type:'Alojamiento',subtype:'Hotel',verticals:['Alojamiento','Gastronomía'],subtypes:['Hotel','Restaurante'],channel:'whatsapp',now:new Date('2026-10-19T15:00:00.000Z')};
  const template='<p>{{type}} · {{subtype}}</p>';
  const context=buildMessageTemplateContext(input),preview=htmlToPlainText(renderMessageTemplate(template,context,defaultMessageVariableSettings())),server=htmlToPlainText(renderMessageTemplateHtml(template,buildMessageTemplateContext(input),defaultMessageVariableSettings()));
  expect(preview).toBe('Alojamiento y Gastronomía · Hotel y Restaurante');expect(server).toBe(preview);
 });
});
