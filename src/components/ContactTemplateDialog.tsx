import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./Dialog";
import { Button } from "./Button";
import { NextActionPicker } from "./NextActionPicker";
import { useAuth } from "../helpers/useAuth";
import { htmlToPlainText, renderMessageTemplate, renderMessageTemplateHtml } from "../helpers/renderMessageTemplate";
import { buildHospedaEmailHtml } from "../helpers/hospedaEmailLayout";
import { htmlToWhatsApp } from "../helpers/templateChannelFormatting";
import { postSendTemplateEmail } from "../endpoints/send_template_email_POST.schema";
import { postLeadContact } from "../endpoints/lead_contact_POST.schema";
import { getCommercialDetail } from "../endpoints/commercial.schema";
import styles from "./ContactTemplateDialog.module.css";

type Template={id:string;channel:string;name:string;subject:string|null;body:string;vertical:string|null;commercialProfile:string|null};
type Result="Sin respuesta"|"Respondió"|"Interesado"|"Recontactar"|"No interesado";
const RESULTS:Result[]=["Sin respuesta","Respondió","Interesado","Recontactar","No interesado"];
const text=(value:unknown)=>value==null?"":String(value);

export const ContactTemplateDialog=({
  open,onOpenChange,channel,lead,templates
}:{
  open:boolean;onOpenChange:(open:boolean)=>void;channel:"whatsapp"|"email";lead:any|null;templates:Template[];
})=>{
  const {authState}=useAuth();
  const qc=useQueryClient();
  const [selectedContactId,setSelectedContactId]=useState<string|null>(null);
  const detailQ=useQuery({queryKey:["commercial-detail","",String(lead?.id??"")],queryFn:()=>getCommercialDetail(undefined,String(lead.id)),enabled:open&&!!lead?.id});
  const [selectedEmailTemplate,setSelectedEmailTemplate]=useState<Template|null>(null);
  const [sending,setSending]=useState(false);
  const [sendError,setSendError]=useState("");
  const [sentMessageId,setSentMessageId]=useState("");
  const [interactionStarted,setInteractionStarted]=useState(false);
  const [result,setResult]=useState<Result>("Sin respuesta");
  const [nextAction,setNextAction]=useState("");

  useEffect(()=>{
    if(open){
      setSelectedContactId(null);
      setSelectedEmailTemplate(null);setSending(false);setSendError("");setSentMessageId("");
      setInteractionStarted(false);setResult("Sin respuesta");setNextAction("");
    }
  },[open,channel,lead?.id]);

  const contactM=useMutation({
    mutationFn:postLeadContact,
    onSuccess:async()=>{
      await Promise.all([
        qc.invalidateQueries({queryKey:["leads"]}),qc.invalidateQueries({queryKey:["lead-stats"]}),
        qc.invalidateQueries({queryKey:["analytics"]}),qc.invalidateQueries({queryKey:["lead-journal"]}),
        qc.invalidateQueries({queryKey:["global-journal"]}),qc.invalidateQueries({queryKey:["commercial-detail"]})
      ]);
      onOpenChange(false);
    }
  });

  const senderShort=authState.type==="authenticated"?authState.user.displayName:"";
  const sender=authState.type==="authenticated"?(authState.user.fullName?.trim()||authState.user.displayName):"";
  const contacts=detailQ.data?.contacts.filter(c=>!c.deletedAt)??[];
  const preferredId=detailQ.data?.opportunities.find(o=>String(o.id)===String(lead?.id))?.primaryContactId;
  const defaultContact=contacts.find(c=>String(c.id)===String(preferredId))||(contacts.length===1?contacts[0]:contacts.find(c=>c.isPrimary));
  // Migrated/legacy entries retain their live generic fields until a named opportunity is configured.
  const legacyDefault=defaultContact?.sourceLeadId!=null&&String(defaultContact.sourceLeadId)===String(lead?.id)&&!detailQ.data?.opportunities.find(o=>String(o.id)===String(lead?.id))?.opportunityName;
  const effectiveContactId=selectedContactId??(defaultContact&&!legacyDefault?String(defaultContact.id):"");
  const person=contacts.find(c=>String(c.id)===effectiveContactId);
  const recipient=effectiveContactId?{name:person?.name??"",phone:person?.phone??"",email:person?.email??""}:{name:lead?.contactName??"",phone:lead?.telefono??"",email:lead?.email??""};
  const ready=!!detailQ.data&&!detailQ.isFetching&&(!effectiveContactId||!!person);
  const hasChannel=!!(channel==="whatsapp"?recipient.phone:recipient.email);
  const context={name:lead?.nombre,contact:recipient.name,contact_name:recipient.name,city:lead?.ciudad,type:lead?.tipo,subtype:lead?.subtipo,phone:recipient.phone,email:recipient.email,website:lead?.sitioWeb,sender,sender_short:senderShort};
  const referenteWhatsapp=channel==="whatsapp"&&lead?.commercialProfile==="Referente";
  const applicableTemplates=referenteWhatsapp?[]:templates.filter(template=>
    (!template.vertical||template.vertical===lead?.tipo)&&(!template.commercialProfile||template.commercialProfile===lead?.commercialProfile)
  );
  const renderPlain=(value:string)=>renderMessageTemplate(value,context);
  const renderHtml=(value:string)=>renderMessageTemplateHtml(value,context);

  const startWhatsapp=(template?:Template)=>{
    if(!lead||!ready||!hasChannel)return;
    const phone=text(recipient.phone).replace(/\D/g,"");
    if(!phone)return;
    const message=(template?htmlToWhatsApp(renderHtml(template.body)):"").normalize("NFC");
    const url=new URL("https://wa.me/"+phone);
    if(message)url.searchParams.set("text",message);
    window.open(url.toString(),"_blank","noopener,noreferrer");
    setSelectedContactId(effectiveContactId);setInteractionStarted(true);
  };
  const sendEmail=async(template:Template)=>{
    if(!lead||!ready||!hasChannel)return;
    setSending(true);setSendError("");setSentMessageId("");
    try{
      const response=await postSendTemplateEmail({leadId:String(lead.id),templateId:template.id,contactId:effectiveContactId||null});
      setSentMessageId(response.messageId);setSelectedContactId(effectiveContactId);setInteractionStarted(true);
    }catch(error){setSendError(error instanceof Error?error.message:"No se pudo enviar el email")}
    finally{setSending(false)}
  };
  const startEmailWithoutTemplate=()=>{
    const email=ready?text(recipient.email):"";if(!email)return;
    window.location.href="mailto:"+email;setSelectedContactId(effectiveContactId);setInteractionStarted(true);
  };
  const saveOutcome=()=>lead&&contactM.mutate({
    leadId:String(lead.id),contactId:effectiveContactId||null,channel,result,nextAction:nextAction||null
  });

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className={styles.dialog}>
    <DialogHeader><DialogTitle>{channel==="whatsapp"?"Enviar WhatsApp":"Enviar email"}</DialogTitle><DialogDescription>{lead?.nombre}{recipient.name?" · "+recipient.name:""}</DialogDescription></DialogHeader>
    <label className={styles.recipient}>Destinatario<select aria-label="Destinatario" value={effectiveContactId} disabled={interactionStarted||sending||!ready} onChange={e=>{setSelectedContactId(e.target.value);setSelectedEmailTemplate(null);setSendError("");}}>
      <option value="">Datos genéricos / históricos del negocio</option>{contacts.map(c=><option key={c.id} value={String(c.id)}>{c.name}{c.isPrimary?" · Principal":""}</option>)}
    </select></label>
    <p className={styles.recipientHelp}>El destinatario determina el teléfono/email y los datos de persona usados en el template. “Datos genéricos / históricos” conserva el contacto anterior del lead. Si no hay nombre de persona, esa variable queda vacía. Revisá la vista previa antes de enviar.</p>
    <p className={styles.recipientChannel}>{channel==="whatsapp"?recipient.phone:recipient.email}</p>
    {detailQ.error&&<p role="alert" className={styles.errorBox}>{detailQ.error.message}</p>}
    {ready&&!hasChannel&&<p role="alert" className={styles.errorBox}>El destinatario seleccionado no tiene {channel==="whatsapp"?"teléfono":"email"}. Elegí otro contacto o los datos genéricos.</p>}
    {!lead?.commercialProfile&&<p className={styles.empty}>Este lead todavía no tiene Perfil comercial. Los templates segmentados aparecerán cuando lo clasifiques.</p>}
    {referenteWhatsapp&&<p className={styles.empty}>Para el perfil Referente los templates de primer contacto están disponibles únicamente por Email.</p>}

    {!interactionStarted&&<>
      {applicableTemplates.length?<div className={styles.list}>{applicableTemplates.map(template=>{
        const html=renderHtml(template.body);
        const preview=channel==="whatsapp"?htmlToWhatsApp(html):htmlToPlainText(html);
        return <button key={template.id} type="button" disabled={!ready||!hasChannel} onClick={()=>channel==="whatsapp"?startWhatsapp(template):setSelectedEmailTemplate(template)} className={selectedEmailTemplate?.id===template.id?styles.selected:""}>
          <strong>{template.name}</strong>{channel==="email"&&template.subject?<em>{renderPlain(template.subject)}</em>:null}<span>{preview.slice(0,220)}{preview.length>220?"…":""}</span>
        </button>;
      })}</div>:<p className={styles.empty}>No hay templates aplicables a este lead para este canal.</p>}
      {channel==="email"&&selectedEmailTemplate&&<div className={styles.emailPreview}>
        <div className={styles.previewHeader}><strong>Vista previa</strong><span>{renderPlain(selectedEmailTemplate.subject??"")}</span></div>
        <iframe className={styles.previewFrame} title="Vista previa del email" srcDoc={buildHospedaEmailHtml({bodyHtml:renderHtml(selectedEmailTemplate.body),senderName:sender,subject:renderPlain(selectedEmailTemplate.subject??"")||"Mensaje de Hospeda",vertical:lead?.tipo,commercialProfile:lead?.commercialProfile})}/>
        <Button onClick={()=>void sendEmail(selectedEmailTemplate)} disabled={sending||!ready||!hasChannel}>{sending?"Enviando…":"Enviar email"}</Button>
      </div>}
      {sendError&&<div className={styles.errorBox}>{sendError}</div>}
    </>}

    {interactionStarted&&<div className={styles.outcomeBox}>
      <div><strong>{sentMessageId?"Email enviado":"Contacto abierto"}</strong><span>Registrá el resultado ahora para que el seguimiento quede actualizado.</span></div>
      <label>Resultado<select value={result} onChange={e=>setResult(e.target.value as Result)}>{RESULTS.map(item=><option key={item}>{item}</option>)}</select></label>
      <label>Próxima acción<NextActionPicker value={nextAction} onChange={setNextAction}/></label>
      {contactM.error&&<div className={styles.errorBox}>{contactM.error.message}</div>}
      <Button onClick={saveOutcome} disabled={contactM.isPending}>{contactM.isPending?"Registrando…":"Registrar resultado y cerrar"}</Button>
    </div>}

    <DialogFooter>
      {!interactionStarted&&<Button variant="outline" disabled={!ready||!hasChannel} onClick={()=>channel==="whatsapp"?startWhatsapp():startEmailWithoutTemplate()}>Abrir sin template</Button>}
      <Button variant="ghost" onClick={()=>onOpenChange(false)}>{interactionStarted?"Cerrar sin registrar":"Cancelar"}</Button>
    </DialogFooter>
  </DialogContent></Dialog>;
};