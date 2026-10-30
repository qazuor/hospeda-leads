import {buildMessageTemplateContext} from './messageTemplateContext';
import {renderMessageTemplate,renderMessageTemplateHtml,htmlToPlainText} from './renderMessageTemplate';
import {defaultMessageVariableSettings} from './messageVariables';

describe('shared template context',()=>{
 it('keeps the client preview and communication service HTML render text identical for the same inputs and picks',()=>{
  const input={accountId:'42',contactId:'7',name:'Posada Sol',contact:'Ana Pérez',city:'Colón',type:'Alojamiento',subtype:'Hotel',phone:'+5493442000000',email:'ana@example.com',website:'https://example.com',sender:'Leandro',senderShort:'Leo',senderEmail:'leo@example.com',commercialProfile:'Referente',isClient:true,channel:'whatsapp',purpose:'first_contact' as const,variation:2,previousPicks:{saludo:'saludo-formal'},now:new Date('2026-10-19T15:00:00.000Z')};
  const template='<p>{{saludo}} {{contact_first}}. Te escribo de {{sender}} ({{sender_email}}).</p><p>{{firma}}</p>';
  const preview=htmlToPlainText(renderMessageTemplate(template,buildMessageTemplateContext(input),defaultMessageVariableSettings()));
  const serverHtml=renderMessageTemplateHtml(template,buildMessageTemplateContext(input),defaultMessageVariableSettings());
  expect(htmlToPlainText(serverHtml)).toBe(preview);
 });
});
