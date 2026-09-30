const DEFAULT_LOGO_URL="/hospeda-logo.jpg";
const SITE_URL="https://hospeda.com.ar";

const escapeHtml=(value:string)=>value
  .replaceAll("&","&amp;")
  .replaceAll("<","&lt;")
  .replaceAll(">","&gt;")
  .replaceAll('"',"&quot;")
  .replaceAll("'","&#39;");

const profileLabel=(profile?:string|null)=>{
  if(profile==="Referente")return "INVITACIÓN INSTITUCIONAL";
  if(profile==="Consolidado")return "PROPUESTA COMERCIAL";
  return "INVITACIÓN";
};

const styleBodyHtml=(html:string)=>html
  .replace(/<p>/gi,'<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#314454;">')
  .replace(/<h2>/gi,'<h2 style="margin:22px 0 10px;font-size:21px;line-height:1.3;color:#17354a;">')
  .replace(/<h3>/gi,'<h3 style="margin:20px 0 9px;font-size:17px;line-height:1.35;color:#17354a;">')
  .replace(/<strong>/gi,'<strong style="font-weight:700;color:#17354a;">')
  .replace(/<blockquote>/gi,'<blockquote style="margin:20px 0;padding:16px 18px;background:#f3f9fb;border-left:4px solid #1EA7A1;border-radius:0 10px 10px 0;color:#294b5a;">')
  .replace(/<ul>/gi,'<ul style="margin:14px 0 18px;padding-left:23px;color:#314454;">')
  .replace(/<ol>/gi,'<ol style="margin:14px 0 18px;padding-left:23px;color:#314454;">')
  .replace(/<li>/gi,'<li style="margin:0 0 7px;line-height:1.55;">')
  .replace(/<a\s+href=/gi,'<a style="color:#258fbe;text-decoration:underline;font-weight:600;" href=')
  .replace(/<hr\s*\/?\s*>/gi,'<hr style="border:0;border-top:1px solid #dce7ed;margin:22px 0;">');

export function buildHospedaEmailHtml({
  bodyHtml,
  senderName,
  subject,
  vertical,
  commercialProfile
}:{
  bodyHtml:string;
  senderName:string;
  subject:string;
  vertical?:string|null;
  commercialProfile?:string|null;
  logoUrl?:string;
}){
  const logoUrl=arguments[0]?.logoUrl||DEFAULT_LOGO_URL;
  const safeSender=escapeHtml(senderName||"Equipo Hospeda");
  const safeSubject=escapeHtml(subject);
  const safeVertical=escapeHtml(vertical||"Turismo");
  const overline=profileLabel(commercialProfile);
  const styledBody=styleBodyHtml(bodyHtml);
  return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <title>${safeSubject}</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f7fa;font-family:Arial,Helvetica,sans-serif;color:#24313d;">
    <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">
      Una propuesta de Hospeda para conectar turismo, experiencias y servicios del Litoral Entrerriano.
    </span>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f3f7fa;margin:0;padding:0;">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #dfe8ef;box-shadow:0 8px 28px rgba(33,55,72,.08);">
            <tr>
              <td align="center" style="padding:22px 28px 18px;background:#ffffff;">
                <a href="${SITE_URL}" target="_blank" style="text-decoration:none;">
                  <img src="${logoUrl}" width="178" alt="Hospeda" style="display:block;width:178px;max-width:70%;height:auto;border:0;outline:none;text-decoration:none;">
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:0;font-size:0;line-height:0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td width="34%" height="5" bgcolor="#3AA7D9"></td>
                    <td width="28%" height="5" bgcolor="#1EA7A1"></td>
                    <td width="22%" height="5" bgcolor="#8CC63F"></td>
                    <td width="16%" height="5" bgcolor="#F5A623"></td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 34px 24px;background:#DFECF8;">
                <div style="font-size:11px;line-height:1.2;letter-spacing:1.6px;font-weight:700;color:#1f7fa9;text-transform:uppercase;margin-bottom:9px;">${overline} · ${safeVertical}</div>
                <div style="font-size:26px;line-height:1.25;font-weight:700;color:#17354a;">${safeSubject}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 34px 14px;">
                <div style="font-size:15px;line-height:1.65;color:#314454;">
                  ${styledBody}
                </div>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:8px 34px 30px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td align="center" bgcolor="#3AA7D9" style="border-radius:9px;">
                      <a href="${SITE_URL}" target="_blank" style="display:inline-block;padding:13px 24px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:9px;">Conocer Hospeda</a>
                    </td>
                  </tr>
                </table>
                <div style="margin-top:12px;font-size:11px;color:#71808c;">hospeda.com.ar</div>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 34px;background:#f8fafb;border-top:1px solid #e7edf1;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="font-size:13px;line-height:1.55;color:#405565;">
                      <strong style="color:#203747;">${safeSender}</strong><br>
                      Equipo Hospeda<br>
                      <a href="${SITE_URL}" style="color:#3AA7D9;text-decoration:none;">hospeda.com.ar</a>
                    </td>
                    <td align="right" valign="bottom" style="font-size:10px;line-height:1.45;color:#84929c;">
                      Turismo del Litoral Entrerriano
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
          <div style="max-width:640px;margin:14px auto 0;font-size:10px;line-height:1.5;color:#87949e;text-align:center;">
            Hospeda conecta alojamientos, gastronomía, experiencias, servicios y propuestas locales del Litoral Entrerriano.
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildHospedaEmailText({
  bodyText,
  senderName
}:{
  bodyText:string;
  senderName:string;
}){
  return [
    bodyText.trim(),
    "",
    "Conocer Hospeda: https://hospeda.com.ar",
    "",
    senderName||"Equipo Hospeda",
    "Equipo Hospeda",
    "https://hospeda.com.ar"
  ].join("\n");
}