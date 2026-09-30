import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./Dialog";
import { Button } from "./Button";
import { useAuth } from "../helpers/useAuth";
import { htmlToPlainText, renderMessageTemplate, renderMessageTemplateHtml } from "../helpers/renderMessageTemplate";
import { buildHospedaEmailHtml } from "../helpers/hospedaEmailLayout";
import { htmlToWhatsApp } from "../helpers/templateChannelFormatting";
import { postSendTemplateEmail } from "../endpoints/send_template_email_POST.schema";
import styles from "./ContactTemplateDialog.module.css";

type Template={
  id:string;channel:string;name:string;subject:string|null;body:string;
  vertical:string|null;commercialProfile:string|null;
};

const text=(value:unknown)=>value==null?"":String(value);

export const ContactTemplateDialog=({
  open,onOpenChange,channel,lead,templates
}:{
  open:boolean;
  onOpenChange:(open:boolean)=>void;
  channel:"whatsapp"|"email";
  lead:any|null;
  templates:Template[];
})=>{
  const {authState}=useAuth();
  const [selectedEmailTemplate,setSelectedEmailTemplate]=useState<Template|null>(null);
  const [sending,setSending]=useState(false);
  const [sendError,setSendError]=useState("");
  const [sentMessageId,setSentMessageId]=useState("");
  useEffect(()=>{
    if(open){
      setSelectedEmailTemplate(null);
      setSending(false);
      setSendError("");
      setSentMessageId("");
    }
  },[open,channel,lead?.id]);
  const sender=authState.type==="authenticated"?authState.user.displayName:"";
  const context={
    name:lead?.nombre,
    contact:lead?.contactName,
    contact_name:lead?.contactName,
    city:lead?.ciudad,
    type:lead?.tipo,
    subtype:lead?.subtipo,
    phone:lead?.telefono,
    email:lead?.email,
    website:lead?.sitioWeb,
    sender
  };
  const referenteWhatsapp=channel==="whatsapp"&&lead?.commercialProfile==="Referente";
  const applicableTemplates=referenteWhatsapp?[]:templates.filter(template=>
    (!template.vertical||template.vertical===lead?.tipo)&&
    (!template.commercialProfile||template.commercialProfile===lead?.commercialProfile)
  );
  const renderPlain=(value:string)=>renderMessageTemplate(value,context);
  const renderHtml=(value:string)=>renderMessageTemplateHtml(value,context);
  const openWhatsApp=(template?:Template)=>{
    if(!lead)return;
    const phone=text(lead.telefono).replace(/\D/g,"");
    if(!phone)return;
    const message=(template?htmlToWhatsApp(renderHtml(template.body)):"").normalize("NFC");
    const url=new URL("https://wa.me/"+phone);
    if(message)url.searchParams.set("text",message);
    window.open(url.toString(),"_blank","noopener,noreferrer");
    onOpenChange(false);
  };
  const sendEmail=async(template:Template)=>{
    if(!lead)return;
    setSending(true);
    setSendError("");
    setSentMessageId("");
    try{
      const result=await postSendTemplateEmail({leadId:String(lead.id),templateId:template.id});
      setSentMessageId(result.messageId);
    }catch(error){
      setSendError(error instanceof Error?error.message:"No se pudo enviar el email");
    }finally{
      setSending(false);
    }
  };
  const openEmailWithoutTemplate=()=>{
    const email=text(lead?.email);
    if(!email)return;
    window.location.href="mailto:"+email;
    onOpenChange(false);
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className={styles.dialog}>
    <DialogHeader><DialogTitle>{channel==="whatsapp"?"Enviar WhatsApp":"Enviar email"}</DialogTitle><DialogDescription>{lead?.nombre}{lead?.contactName?" · "+lead.contactName:""}</DialogDescription></DialogHeader>
    {!lead?.commercialProfile&&<p className={styles.empty}>Este lead todavía no tiene Perfil comercial. Los templates segmentados aparecerán cuando lo clasifiques como Independiente, Consolidado o Referente.</p>}
    {referenteWhatsapp&&<p className={styles.empty}>Para el perfil Referente los templates de primer contacto están disponibles únicamente por Email.</p>}
    {sentMessageId?<div className={styles.successBox}>
      <strong>Email enviado</strong>
      <span>Brevo aceptó el mensaje. ID: {sentMessageId}</span>
    </div>:<>
    {applicableTemplates.length?<div className={styles.list}>{applicableTemplates.map(template=>{
      const html=renderHtml(template.body);
      const preview=channel==="whatsapp"?htmlToWhatsApp(html):htmlToPlainText(html);
      return <button key={template.id} type="button" onClick={()=>channel==="whatsapp"?openWhatsApp(template):setSelectedEmailTemplate(template)} className={selectedEmailTemplate?.id===template.id?styles.selected:""}>
        <strong>{template.name}</strong>{channel==="email"&&template.subject?<em>{renderPlain(template.subject)}</em>:null}<span>{preview.slice(0,220)}{preview.length>220?"…":""}</span>
      </button>
    })}</div>:<p className={styles.empty}>No hay templates aplicables a este lead para este canal.</p>}
    {channel==="email"&&selectedEmailTemplate&&<div className={styles.emailPreview}>
      <div className={styles.previewHeader}><strong>Vista previa</strong><span>{renderPlain(selectedEmailTemplate.subject??"")}</span></div>
      <iframe
        className={styles.previewFrame}
        title="Vista previa del email"
        srcDoc={buildHospedaEmailHtml({
          bodyHtml:renderHtml(selectedEmailTemplate.body),
          senderName:sender,
          subject:renderPlain(selectedEmailTemplate.subject??"")||"Mensaje de Hospeda",
          vertical:lead?.tipo,
          commercialProfile:lead?.commercialProfile
        })}
      />
      <Button onClick={()=>void sendEmail(selectedEmailTemplate)} disabled={sending}>{sending?"Enviando…":"Enviar email"}</Button>
    </div>}
    {sendError&&<div className={styles.errorBox}>{sendError}</div>}
    </>}
    <DialogFooter>
      {sentMessageId
        ? <Button onClick={()=>onOpenChange(false)}>Cerrar</Button>
        : <>
          <Button variant="outline" onClick={()=>channel==="whatsapp"?openWhatsApp():openEmailWithoutTemplate()}>Abrir sin template</Button>
          <Button variant="ghost" onClick={()=>onOpenChange(false)}>Cancelar</Button>
        </>}
    </DialogFooter>
  </DialogContent></Dialog>;
};