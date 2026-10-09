import {CrmDateInput} from './ui/CrmDateInput';
import {QueryLoadingNotice} from './QueryLoadingNotice';
import {QueryErrorNotice} from './QueryErrorNotice';
import {Fieldset} from '@mantine/core';
import {MaterialThumbnail} from './MaterialThumbnail';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from './Dialog';
import {ResourceLinkForm} from "./ResourceLinkForm";
import {Link} from "react-router-dom";
import { Disclosure, DisclosureSummary } from './Disclosure';
import { Input } from './Input';
import { NativeSelect } from './NativeSelect';
import {useUnsavedChanges} from './UnsavedChanges';
import {DocumentPreviewDialog,canPreviewDocument} from './DocumentPreviewDialog';
import {calendarDay} from '../helpers/workDates';
import {formatDate} from '../helpers/crmDates';
import {getCommercialDetail,getCommercialList} from '../endpoints/commercial.schema';
import {getWork} from '../endpoints/work.schema';
import React,{useRef,useState} from 'react';import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';import {getResources,postResource,type ResourceMutation,type ResourceVersion} from '../endpoints/resources.schema';import {useAuth} from '../helpers/useAuth';import {Button} from './Button';import styles from './Communication.module.css';
type VersionTarget={id:string;revision:number;title:string};

export function ResourcesPanel({accountId,leadId,activityId,manageLibrary=false,readOnly=false}:{accountId?:string;leadId?:string;activityId?:string;manageLibrary?:boolean;readOnly?:boolean}){
 const {authState}=useAuth(),qc=useQueryClient();const admin=authState.type==='authenticated'&&authState.user.role==='admin';
 const [previewVersion,setPreviewVersion]=useState<ResourceVersion|null>(null);
 const [linkDoc,setLinkDoc]=useState(''),[targetSearch,setTargetSearch]=useState(''),[targetAccount,setTargetAccount]=useState(''),[contextLead,setContextLead]=useState(''),[contextActivity,setContextActivity]=useState('');
 const [search,setSearch]=useState(''),[categoryFilter,setCategoryFilter]=useState(''),[title,setTitle]=useState(''),[type,setType]=useState('propuesta'),[url,setUrl]=useState(''),[file,setFile]=useState<File|null>(null),[expires,setExpires]=useState(''),[category,setCategory]=useState(''),[versionTarget,setVersionTarget]=useState<VersionTarget|null>(null),[categoryName,setCategoryName]=useState(''),[error,setError]=useState('');
 const q=useQuery({queryKey:['resources',accountId??'',search,leadId??''],queryFn:()=>getResources(accountId,search,leadId)});
 const libraryQ=useQuery({queryKey:['resources','library',''],queryFn:()=>getResources(),enabled:!!accountId&&!readOnly});
 const accountsQ=useQuery({queryKey:['commercial','resource-target',targetSearch],queryFn:()=>getCommercialList(targetSearch,'',1),enabled:!!linkDoc&&!accountId});
 const scopeAccount=accountId||targetAccount;
 const contextQ=useQuery({queryKey:['commercial-detail',scopeAccount??'',''],queryFn:()=>getCommercialDetail(scopeAccount),enabled:!!scopeAccount});
 const workQ=useQuery({queryKey:['work','resource-context',scopeAccount],queryFn:()=>getWork({accountId:scopeAccount,mode:'detail',responsible:admin?'all':undefined}),enabled:!!scopeAccount&&!readOnly&&admin});
 const lock=useRef(false),nextEditor=useRef<VersionTarget|null>(null),createAttempt=useRef<{signature:string;id:string}|null>(null);
 const [pending,setPending]=useState(''),[notice,setNotice]=useState(''),[fileKey,setFileKey]=useState(0);
 const [deleteTarget,setDeleteTarget]=useState<{id:string;revision:number;title:string}|null>(null);
 const busy=!!pending;
 function resetEditor(next:VersionTarget|null=null){
  setVersionTarget(next);setTitle('');setType('propuesta');setCategory('');
  setUrl('');setFile(null);setExpires('');setFileKey(key=>key+1);
  setError('');createAttempt.current=null;
 }
 const draftGuard=useUnsavedChanges(!!title.trim()||!!url.trim()||!!file||!!expires||type!=='propuesta'||!!category||busy,()=>{
  if(!lock.current)resetEditor(nextEditor.current);
 });
 function changeEditor(next:VersionTarget|null){
  if(lock.current)return;
  nextEditor.current=next;draftGuard.requestClose();
 }
 const m=useMutation({mutationFn:postResource,onSuccess:()=>{void qc.invalidateQueries({queryKey:['resources']})}});
 async function run(input:ResourceMutation,label:string){
  if(lock.current)return;
  lock.current=true;setPending(label);setError('');setNotice('');
  try{
   await m.mutateAsync(input);
   if(input.action==='link')setLinkDoc('');
   if(input.action==='category'&&!input.id)setCategoryName('');
   if(input.action==='delete'){
    setDeleteTarget(null);
    if(versionTarget?.id===input.id)resetEditor();
   }
   setNotice(input.action==='delete'?'Documento dado de baja. Sus versiones e historial se conservan.':
    input.action==='status'?'Estado del documento actualizado.':
    input.action==='category'?'Categoría actualizada.':'Documento vinculado. No se envió al cliente.');
  }catch(e){setError(e instanceof Error?e.message:'No se pudo guardar. Reintentá.')}
  finally{lock.current=false;setPending('')}
 }
 async function submit(){
  // The ref also covers the FileReader interval and a second click before React renders.
  if(lock.current)return;
  lock.current=true;setPending(file?'Preparando archivo…':'Guardando documento…');setError('');setNotice('');
  try{
   let fileData:string|undefined;
   if(file){
    if(file.size>(q.data?.maxDocumentBytes??2097152))throw new Error('Archivo demasiado grande');
    fileData=await new Promise<string>((resolve,reject)=>{
     const reader=new FileReader();
     reader.onload=()=>resolve(String(reader.result).split(',')[1]);
     reader.onerror=()=>reject(new Error('No se pudo leer el archivo. Tu selección se conserva.'));
     reader.onabort=()=>reject(new Error('Se interrumpió la lectura del archivo.'));
     reader.readAsDataURL(file);
    });
   }
   const version={...(file?{fileData,fileName:file.name,mimeType:file.type as 'application/pdf'|'image/png'|'image/jpeg'|'text/plain'}:{url}),expiresOn:expires||null};
   let input:ResourceMutation;
   if(versionTarget)input={action:'version',id:versionTarget.id,revision:versionTarget.revision,version};
   else{
    const draft={action:'create' as const,title,type,accountId:accountId??null,leadId:leadId||contextLead||null,
     activityId:activityId||contextActivity||null,library:!accountId,categoryId:category||null,version};
    // An unchanged retry keeps the server's idempotency key; editing starts a new attempt.
    const signature=JSON.stringify(draft);
    if(createAttempt.current?.signature!==signature)createAttempt.current={signature,id:crypto.randomUUID()};
    input={...draft,id:createAttempt.current.id};
   }
   setPending(versionTarget?'Guardando versión…':'Guardando documento…');
   await m.mutateAsync(input);resetEditor();
   setNotice(input.action==='version'?'Nueva versión guardada como borrador. Requiere aprobación.':'Documento guardado como borrador. Requiere aprobación.');
  }catch(e){setError((e instanceof Error?e.message:'No se pudo guardar el documento')+'. Los datos del formulario se conservan.')}
  finally{lock.current=false;setPending('')}
 }
 const vLink=(v:ResourceVersion)=><span className={styles.documentLinks}><Button asChild size="sm" variant="outline"><a href={'/_api/resources/download?versionId='+v.id} target="_blank" rel="noopener noreferrer">{v.url?'Abrir vínculo':'Descargar documento'} · v{v.version}</a></Button>{canPreviewDocument(v)&&<Button size="sm" onClick={()=>setPreviewVersion(v)} aria-label={'Previsualizar '+v.fileName+' · v'+v.version}>Previsualizar</Button>}</span>;
 if(q.isPending)return <QueryLoadingNotice>Cargando documentos…</QueryLoadingNotice>;if(!q.data)return <QueryErrorNotice error={q.error!} onRetry={q.refetch} busy={q.isFetching} label="Reintentar documentos"/>;
 return <section className={styles.panel}>{q.error&&<QueryErrorNotice error={q.error} onRetry={q.refetch} busy={q.isFetching} label="Reintentar documentos"/>}{!accountId&&<h2>Biblioteca comercial</h2>}{accountId&&<><h3>{leadId?"Documentos de esta gestión":"Documentos del negocio"}</h3>{leadId&&<p><Link to={"/accounts/"+accountId+"?section=documents"}>Consultar todos los documentos del negocio</Link></p>}</>}<p className={styles.muted}>Recursos aprobados para consultar y reutilizar. La biblioteca se administra desde Configuración por un admin. Vincular un documento no lo envía al cliente. Abrilo y elegí cómo compartirlo.</p>
 <div className={styles.grid}>{!accountId&&<label>Buscar recurso<Input value={search} onChange={e=>setSearch(e.target.value)}/></label>}<label>Categoría<NativeSelect value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option value="">Todas</option>{q.data.categories.map(c=><option key={c.id} value={c.id}>{c.name}{c.active?'':' (inactiva)'}</option>)}</NativeSelect></label></div>
 {accountId&&!readOnly&&<ResourceLinkForm key={accountId+':'+(leadId??'')} accountId={accountId} leadId={leadId} documents={libraryQ.data?.documents??[]} loading={libraryQ.isPending||libraryQ.isFetching} error={libraryQ.error} onRetry={()=>{void libraryQ.refetch()}} onPreview={setPreviewVersion}/>}
 {(!readOnly&&!accountId&&linkDoc)&&<Disclosure open={!!linkDoc}><DisclosureSummary>Vincular recurso aprobado sin copiar</DisclosureSummary><div className={styles.panel}>{!accountId&&<><label>Buscar negocio destino<Input disabled={busy} value={targetSearch} onChange={e=>setTargetSearch(e.target.value)}/></label><label>Negocio destino<NativeSelect disabled={busy} value={targetAccount} onChange={e=>{setTargetAccount(e.target.value);setContextLead('');setContextActivity('')}}><option value="">Elegir negocio</option>{accountsQ.data?.rows.map(a=><option key={a.id} value={a.id}>{a.nombre} · {a.ciudad}</option>)}</NativeSelect></label></>}<Button disabled={!scopeAccount||!linkDoc||busy} onClick={()=>void run({action:'link',id:linkDoc,accountId:scopeAccount!,leadId:leadId||contextLead||null,activityId:activityId||contextActivity||null},'Vinculando documento…')}>Confirmar vínculo al contexto</Button></div></Disclosure>}
 {accountId&&!leadId&&!readOnly&&admin&&<label>Gestión vinculada (opcional)<NativeSelect disabled={busy} value={contextLead} onChange={e=>{setContextLead(e.target.value);setContextActivity('')}}><option value="">Documento general del negocio</option>{contextQ.data?.opportunities.filter(o=>!o.deletedAt).map(o=><option key={o.id} value={o.id}>{o.opportunityName||'Gestión comercial inicial'}</option>)}</NativeSelect></label>}
 {accountId&&!activityId&&!readOnly&&admin&&<label>Actividad vinculada (opcional)<NativeSelect disabled={busy} value={contextActivity} onChange={e=>setContextActivity(e.target.value)}><option value="">Sin actividad específica</option>{workQ.data?.activities.filter(a=>!(leadId||contextLead)||String(a.leadId)===(leadId||contextLead)).map(a=><option key={a.id} value={a.id}>{a.title} · {new Date(a.occurredAt).toLocaleDateString('es-AR')}</option>)}</NativeSelect></label>}
 {(!readOnly&&admin&&(!!accountId||manageLibrary))&&<Disclosure open={!!versionTarget}><DisclosureSummary>{versionTarget?'Agregar versión':'Agregar documento o recurso'}</DisclosureSummary><Fieldset disabled={busy} variant="unstyled" className={styles.panel}>{versionTarget&&<p>Nueva versión de <strong>{versionTarget.title}</strong> · versión actual: {versionTarget.revision}</p>}{!versionTarget&&<><div className={styles.grid}><label>Título del documento<Input value={title} onChange={e=>setTitle(e.target.value)}/></label><label>Tipo de documento<Input value={type} onChange={e=>setType(e.target.value)}/></label><label>Categoría del recurso<NativeSelect value={category} onChange={e=>setCategory(e.target.value)}><option value="">Sin categoría</option>{q.data.categories.filter(c=>c.active).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect></label></div></>}
 <label>Vínculo HTTP(S)<Input type="url" value={url} disabled={!!file} onChange={e=>setUrl(e.target.value)}/></label><label>O archivo<Input key={fileKey} type="file" aria-label="O archivo" accept=".pdf,.png,.jpg,.jpeg,.txt" disabled={!!url} onChange={e=>setFile(e.target.files?.[0]??null)}/></label><label>Vencimiento opcional<CrmDateInput  value={expires} onValueChange={e=>setExpires(e)}/></label><div className={styles.actions}><Button disabled={busy||(!file&&!url)||(!versionTarget&&title.trim().length<3)} onClick={()=>void submit()}>{busy?pending:versionTarget?'Guardar versión':'Guardar documento'}</Button>{versionTarget&&<Button variant="ghost" disabled={busy} onClick={()=>changeEditor(null)}>Cancelar versión</Button>}</div><p className={styles.muted}>Una nueva versión vuelve a borrador y requiere aprobación. No elimina versiones anteriores.</p></Fieldset></Disclosure>}
 {accountId&&!q.data.documents.length&&<p className={styles.muted}>{leadId?"Esta gestión todavía no tiene documentos vinculados.":"Este negocio todavía no tiene documentos vinculados."}</p>}
 {q.data.documents.filter(d=>!categoryFilter||String(d.categoryId)===categoryFilter).map(d=>{const latest=d.versions[0];const canEdit=!readOnly&&admin&&(!d.library||manageLibrary);return <article key={d.id} className={styles.resourceCard}><h3>{d.title} · {d.status==='approved'?'Aprobado':d.status==='draft'?'Borrador':'Archivado'}</h3>{accountId&&<p className={styles.materialScope}>{d.leadId?'Gestión: '+(contextQ.data?.opportunities.find(o=>String(o.id)===String(d.leadId))?.opportunityName||'Gestión comercial inicial'):!d.library?'Documento general del negocio':null}{d.links?.map((link,i)=><span key={i}>{link.leadId?'Gestión: '+(link.leadName||'Gestión comercial inicial'):'Documento general del negocio'}{link.activityTitle?' · Actividad: '+link.activityTitle:''}</span>)}</p>}<p>{d.type} · {q.data.categories.find(c=>String(c.id)===String(d.categoryId))?.name||'Sin categoría'}</p><p className={styles.muted}>{new Date(d.createdAt).toLocaleDateString('es-AR')}</p>{latest&&<><MaterialThumbnail key={latest.id} version={latest}/><Disclosure><DisclosureSummary>Detalles del archivo y responsables</DisclosureSummary><p>{latest.fileName||'Vínculo externo'}{latest.byteSize!=null?' · '+Math.ceil(latest.byteSize/1024)+' KB':''}{latest.mimeType?' · '+latest.mimeType:''}</p><p>Responsable: {d.ownerEmail}</p><p>{d.approvedBy?'Aprobado por '+d.approvedBy:'Aprobación pendiente'}</p></Disclosure>{vLink(latest)}{latest.expiresOn&&<p>Vencimiento: {formatDate(calendarDay(latest.expiresOn))}</p>}</>}
 <div className={styles.actions}>{canEdit&&latest&&<><Button size="sm" variant="outline" disabled={busy} onClick={()=>changeEditor({id:d.id,revision:latest.version,title:d.title})}>Nueva versión</Button>{admin&&d.status!=='approved'&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>void run({action:'status',id:d.id,status:'approved',revision:latest.version},'Aprobando versión…')}>Aprobar versión</Button>}<Button size="sm" variant="outline" disabled={busy} onClick={()=>void run({action:'status',id:d.id,status:d.status==='archived'?'draft':'archived',revision:latest.version},'Actualizando estado…')}>{d.status==='archived'?'Volver a borrador':'Archivar'}</Button><Button size="sm" variant="destructive" disabled={busy} onClick={()=>{setError('');setDeleteTarget({id:d.id,revision:latest.version,title:d.title})}}>Dar de baja</Button></>}
 {d.library&&d.status==='approved'&&!accountId&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>setLinkDoc(d.id)}>Vincular a negocio</Button>}</div>
 {d.versions.length>1&&<Disclosure><DisclosureSummary>Versiones anteriores ({d.versions.length-1})</DisclosureSummary>{d.versions.slice(1).map(v=><p key={v.id}>{vLink(v)} · {v.actorEmail} · {new Date(v.createdAt).toLocaleString('es-AR')}</p>)}</Disclosure>}</article>})}
 {admin&&manageLibrary&&<Disclosure><DisclosureSummary>Configurar categorías</DisclosureSummary><div className={styles.panel}><label>Nombre de categoría<Input disabled={busy} value={categoryName} onChange={e=>setCategoryName(e.target.value)}/></label><Button disabled={categoryName.trim().length<2||busy} onClick={()=>void run({action:'category',name:categoryName,active:true},'Guardando categoría…')}>Agregar categoría</Button>{q.data.categories.map(c=><p key={c.id}>{c.name} <Button size="sm" variant="ghost" disabled={busy} onClick={()=>void run({action:'category',id:c.id,name:c.name,active:!c.active},'Guardando categoría…')}>{c.active?'Desactivar':'Activar'}</Button></p>)}</div></Disclosure>}
 {busy&&<p role="status">{pending}</p>}{notice&&<p role="status">{notice}</p>}
 {error&&!deleteTarget&&<p role="alert">{error}</p>}
 {deleteTarget&&<Dialog open onOpenChange={open=>{if(!open&&!lock.current)setDeleteTarget(null)}}><DialogContent showCloseButton={!busy}><DialogTitle>Dar de baja documento</DialogTitle><DialogDescription>¿Dar de baja «{deleteTarget.title}»? Se conservarán todas sus versiones e historial.{versionTarget?.id===deleteTarget.id&&' Se descartará la nueva versión sin guardar de este documento.'}</DialogDescription>{error&&<p role="alert">{error}</p>}<div className={styles.actions}><Button variant="outline" disabled={busy} onClick={()=>setDeleteTarget(null)}>Cancelar</Button><Button variant="destructive" disabled={busy} onClick={()=>void run({action:'delete',id:deleteTarget.id,revision:deleteTarget.revision},'Dando de baja documento…')}>{busy?'Dando de baja documento…':'Confirmar baja'}</Button></div></DialogContent></Dialog>}
 {draftGuard.confirmation}
 {previewVersion&&<DocumentPreviewDialog key={previewVersion.id} version={previewVersion} onClose={()=>setPreviewVersion(null)}/>}
 </section>;
}
