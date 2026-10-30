import {contactDestination,displayPhone,emailSentToast,finalActionLabel,whatsappOpenedToast} from './contactDestination';

describe('contact destination labels',()=>{
 it('formats Argentine mobile numbers and keeps anything else readable',()=>{
  expect(displayPhone({phone:'+5493442000002'})).toBe('+54 9 3442000002');
  expect(displayPhone({phone:'5493442000002'})).toBe('+54 9 3442000002');
  expect(displayPhone({phone:'+34 600 123 456'})).toBe('+34600123456');
  expect(displayPhone({phone:'3442 555'})).toBe('3442 555');
 });
 it('names the person and the phone for WhatsApp, only the phone without a name',()=>{
  expect(finalActionLabel({channel:'whatsapp',recipient:'+5493442000002',recipientName:'Ana'})).toBe('Abrir WhatsApp con Ana · +54 9 3442000002');
  expect(finalActionLabel({channel:'whatsapp',recipient:'+5493442000002',recipientName:' '})).toBe('Abrir WhatsApp con +54 9 3442000002');
 });
 it('names the Instagram username and the email address',()=>{
  expect(finalActionLabel({channel:'instagram',recipient:'@hotel.sol',recipientName:'Hotel Sol'})).toBe('Abrir Instagram de @hotel.sol');
  expect(finalActionLabel({channel:'email',recipient:'ana@example.com',recipientName:'Ana'})).toBe('Enviar email a ana@example.com');
 });
 it('writes the close toasts without claiming a send or a delivery',()=>{
  expect(whatsappOpenedToast({destination:contactDestination({channel:'whatsapp',recipient:'+5493442000002',recipientName:'Ana'})})).toBe('WhatsApp abierto para Ana · +54 9 3442000002. Si el script registra el envío, se confirma solo; si no, lo vas a ver en «Requiere acción».');
  expect(emailSentToast({address:'ana@example.com'})).toBe('Email enviado a ana@example.com. La entrega se confirma por separado.');
 });
});
