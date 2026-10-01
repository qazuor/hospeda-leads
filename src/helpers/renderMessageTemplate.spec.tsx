import { htmlToPlainText, renderMessageTemplate, renderMessageTemplateHtml } from "./renderMessageTemplate";
import { htmlToWhatsApp } from "./templateChannelFormatting";

describe("message template rendering",()=>{
  it("resolves optional contact without broken punctuation",()=>{
    const source="{{#if contact}}Hola {{contact}}, ¿cómo estás?{{else}}Hola, ¿cómo estás?{{/if}}";
    expect(renderMessageTemplate(source,{contact:""})).toBe("Hola, ¿cómo estás?");
    expect(renderMessageTemplate(source,{contact:"Morena"})).toBe("Hola Morena, ¿cómo estás?");
  });

  it("supports full and short sender variables",()=>{
    expect(renderMessageTemplate("{{sender}} / {{sender_short}}",{sender:"Leandro Asrilevich",sender_short:"Leo"}))
      .toBe("Leandro Asrilevich / Leo");
  });

  it("renders variables safely inside rich HTML",()=>{
    const html=renderMessageTemplateHtml("<p>Hola <strong>{{contact}}</strong></p>",{contact:"<Leandro>"});
    expect(html).toContain("<strong>&lt;Leandro&gt;</strong>");
    expect(html).not.toContain("<strong><Leandro>");
  });

  it("converts rich WhatsApp formatting",()=>{
    const result=htmlToWhatsApp('<p>Hola <strong>Leo</strong>, <em>bienvenido</em> <s>ayer</s>.</p><p><a href="https://hospeda.com.ar">Hospeda</a></p>');
    expect(result).toContain("*Leo*");
    expect(result).toContain("_bienvenido_");
    expect(result).toContain("~ayer~");
    expect(result).toContain("Hospeda (https://hospeda.com.ar)");
  });

  it("creates a readable email plain-text fallback",()=>{
    const text=htmlToPlainText("<h2>Hola</h2><p>Texto <strong>importante</strong></p><ul><li>Uno</li><li>Dos</li></ul>");
    expect(text).toContain("Hola");
    expect(text).toContain("Texto importante");
    expect(text).toContain("• Uno");
  });
});