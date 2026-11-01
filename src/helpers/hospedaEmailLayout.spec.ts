import { describe, expect, it } from "vitest";
import { buildHospedaEmailHtml, buildHospedaEmailText, HOSPEDA_PHONE } from "./hospedaEmailLayout";

describe("Hospeda email layout", () => {
  it("signs every email with the sender, their email, the shared phone and Equipo Hospeda", () => {
    const html = buildHospedaEmailHtml({ bodyHtml: "<p>Hola</p>", senderName: "Leandro Pérez", senderEmail: "leo@hospeda.com.ar", subject: "Prueba" });
    expect(html).toContain("Leandro Pérez</strong><br>");
    expect(html).toContain(`leo@hospeda.com.ar · ${HOSPEDA_PHONE}<br>`);
    expect(html.match(/Equipo Hospeda/g)).toHaveLength(1);
    expect(buildHospedaEmailText({ bodyText: "Hola", senderName: "Leandro Pérez", senderEmail: "leo@hospeda.com.ar" })).toContain(`Leandro Pérez\nleo@hospeda.com.ar · ${HOSPEDA_PHONE}\nEquipo Hospeda`);
  });

  it("keeps the phone when the sender email is unknown", () => {
    expect(buildHospedaEmailHtml({ bodyHtml: "<p>Hola</p>", senderName: "", subject: "Prueba" })).toContain(`${HOSPEDA_PHONE}<br>`);
  });

  it("renders replies with the seller signature and without the brand header",()=>{
    const html=buildHospedaEmailHtml({bodyHtml:"<p>Respuesta</p>",senderName:"Leandro",subject:"Re: Consulta",variant:"reply"});
    expect(html).toContain("Respuesta");expect(html).toContain("Leandro</strong>");expect(html).not.toContain("Conocer Hospeda</a>");expect(html).not.toContain(">HOSPEDA");
  });

  it("the overline reads «HOSPEDA · {VERTICAL}» in capitals, with room above them (spec 104 D6 and §3.13)",()=>{
    const html=buildHospedaEmailHtml({bodyHtml:"<p>Hola</p>",senderName:"Leandro",subject:"Conocé Hospeda",vertical:"Gastronomía"});
    const overline=html.match(/<div style="([^"]*)">HOSPEDA · GASTRONOMÍA<\/div>/);
    expect(overline).not.toBeNull();
    expect(overline?.[1]).toContain("text-transform:uppercase");
    expect(Number(overline?.[1]?.match(/line-height:([\d.]+)/)?.[1])).toBeGreaterThanOrEqual(1.4);
    expect(html).not.toContain("INVITACIÓN");expect(html).not.toContain("PROPUESTA COMERCIAL");
  });

  it("without a vertical the overline is just «HOSPEDA», and the vertical is escaped",()=>{
    expect(buildHospedaEmailHtml({bodyHtml:"<p>Hola</p>",senderName:"Leandro",subject:"Hola"})).toMatch(/">HOSPEDA<\/div>/);
    expect(buildHospedaEmailHtml({bodyHtml:"<p>Hola</p>",senderName:"Leandro",subject:"Hola",vertical:"  "})).toMatch(/">HOSPEDA<\/div>/);
    expect(buildHospedaEmailHtml({bodyHtml:"<p>Hola</p>",senderName:"Leandro",subject:"Hola",vertical:"<b>Bar</b>"})).toContain(">HOSPEDA · &lt;B&gt;BAR&lt;/B&gt;</div>");
  });
});

