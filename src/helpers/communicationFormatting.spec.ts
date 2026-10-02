import {describe,it,expect} from 'vitest';import {htmlToWhatsApp} from './templateChannelFormatting';
describe('WhatsApp server formatting',()=>{it('preserves emphasis, links and empty names',()=>{expect(htmlToWhatsApp('<p><strong>Hola</strong> <em>persona</em> <s>antes</s></p><p><a href="https://example.com">Web</a></p>')).toBe('*Hola* _persona_ ~antes~\n\nWeb (https://example.com)');});});
