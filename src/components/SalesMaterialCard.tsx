import {Archive,Download,FileText,Image,ImagePlus,Link2,MoreHorizontal,Music,Pencil,Presentation,RotateCcw,Upload,Video} from 'lucide-react';
import {salesMaterialCoverUrl,salesMaterialFileUrl,type SalesMaterial} from '../endpoints/salesMaterials.schema';
import {SALES_MATERIAL_FORMAT_LABELS,formatBytes,salesMaterialFormat,type SalesMaterialFormat} from '../helpers/salesMaterialTypes';
import {formatDateTime} from '../helpers/crmDates';
import {Badge} from './Badge';
import {Button} from './Button';
import {Disclosure,DisclosureSummary} from './Disclosure';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuSeparator,DropdownMenuTrigger} from './DropdownMenu';
import type {SalesMaterialFormMode} from './SalesMaterialForm';
import {canPreviewSalesMaterial} from './SalesMaterialPreview';
import styles from './SalesMaterial.module.css';

export const SALES_MATERIAL_BUSY='La operación está en curso. Esperá a que termine para continuar.';
export const STORAGE_REASON='Almacenamiento no configurado: el archivo no se puede abrir por ahora.';
const formatIcons:Record<SalesMaterialFormat,typeof FileText>={image:Image,pdf:FileText,video:Video,audio:Music,office:Presentation,link:Link2};
/** Stable hue (0-359) of a category, so its placeholder keeps the same color everywhere. */
export const categoryHue=(id:string):number=>{let h=0;for(const c of id)h=(h*31+c.charCodeAt(0))%360;return h;};
/** Up to two initials of a category name («Precios 2027» → «P2», «Folletos» → «F»). */
export const categoryInitials=(name:string):string=>name.trim().split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]!.toUpperCase()).join('');
/**
 * Cover of a card: the stored cover (manual or automatic, or a small image itself) or, when there is none or storage is off,
 * a drawn placeholder with the format icon and the color and initials of the first category (spec 95).
 */
export function SalesMaterialCover({material,storageConfigured}:{material:SalesMaterial;storageConfigured:boolean}){
 const format=salesMaterialFormat({mimeType:material.currentVersion?.mimeType??null});const Icon=formatIcons[format];const category=material.categories[0];
 if(material.hasCover&&storageConfigured)return <img src={salesMaterialCoverUrl({materialId:material.id,revision:material.revision})} alt="" loading="lazy"/>;
 return <span className={styles.placeholder} data-testid="cover-placeholder" style={category?{['--cover-hue' as string]:categoryHue(category.id)}:undefined} data-category={category?'true':undefined}>
  <Icon size={32} aria-hidden="true"/><span>{SALES_MATERIAL_FORMAT_LABELS[format]}</span>{category&&<span className={styles.initials} aria-hidden="true">{categoryInitials(category.name)}</span>}
 </span>;
}
type CardProps={material:SalesMaterial;admin:boolean;selected:boolean;anchor:boolean;busy:boolean;storageConfigured:boolean;onEdit:(mode:SalesMaterialFormMode)=>void;onArchive:(material:SalesMaterial)=>void;onPreview:(material:SalesMaterial)=>void};
/**
 * Card of one material (spec 95): the cover and the title open the preview, «Abrir» is the one visible action and «⋯» holds Descargar and,
 * for admins, Editar, Nueva versión, Portada and (apart) Archivar/Restaurar. Disabled reasons and permissions are the ones of spec 89.
 * `anchor` puts the `material-<id>` id on this card (a material listed under several categories is anchored once).
 */
export function SalesMaterialCard({material,admin,selected,anchor,busy,storageConfigured,onEdit,onArchive,onPreview}:CardProps){
 const current=material.currentVersion;const format=salesMaterialFormat({mimeType:current?.mimeType??null});
 const archived=material.status==='archived';const previewable=storageConfigured&&canPreviewSalesMaterial({material});
 const file=!!current&&!current.url;const busyProps={disabled:busy,title:busy?SALES_MATERIAL_BUSY:undefined};
 const showMenu=file||admin;
 return <article className={styles.card} data-selected={selected||undefined} data-archived={archived||undefined} id={anchor?'material-'+material.id:undefined} aria-label={material.title}>
  {previewable?<button type="button" className={styles.cover} data-format={format} tabIndex={-1} aria-hidden="true" onClick={()=>onPreview(material)}><SalesMaterialCover material={material} storageConfigured={storageConfigured}/></button>
   :<div className={styles.cover} data-format={format}><SalesMaterialCover material={material} storageConfigured={storageConfigured}/></div>}
  <div className={styles.body}>
   <h3>{previewable?<button type="button" className={styles.titleButton} aria-label={'Vista previa de «'+material.title+'»'} onClick={()=>onPreview(material)}>{material.title}</button>:material.title}</h3>
   <div className={styles.badges}><Badge variant={material.kind==='deliverable'?'success':'warning'}>{material.kind==='deliverable'?'Entregable':'Interno'}</Badge><Badge variant="secondary">{SALES_MATERIAL_FORMAT_LABELS[format]}</Badge>{archived&&<Badge variant="destructive">Archivado</Badge>}{material.categories.map(c=><Badge key={c.id} variant="outline">{c.name}</Badge>)}</div>
   {material.description&&<p className={styles.description}>{material.description}</p>}
   {current&&<p className={styles.meta}>{current.url?'Enlace externo':`${current.fileName??'Archivo'}${current.byteSize?' · '+formatBytes({bytes:current.byteSize}):''}`} · versión {current.version}</p>}
   {material.kind==='internal'&&<p className={styles.meta}>Solo para vendedores: no se manda a clientes.</p>}
   <div className={styles.cardActions}>
    {current&&(current.url?<Button asChild size="sm"><a href={salesMaterialFileUrl({versionId:current.id})} target="_blank" rel="noopener noreferrer">Abrir enlace</a></Button>
     :storageConfigured?<Button asChild size="sm"><a href={salesMaterialFileUrl({versionId:current.id})} target="_blank" rel="noopener noreferrer">Abrir</a></Button>:<Button size="sm" disabled disabledReason={STORAGE_REASON}>Abrir</Button>)}
    {showMenu&&<DropdownMenu><DropdownMenuTrigger asChild><Button size="icon-sm" variant="ghost" aria-label={'Más acciones de «'+material.title+'»'}><MoreHorizontal size={18} aria-hidden="true"/></Button></DropdownMenuTrigger>
     <DropdownMenuContent align="end">
      {file&&(storageConfigured?<DropdownMenuItem asChild><a href={salesMaterialFileUrl({versionId:current.id,disposition:'attachment'})}><Download size={15} aria-hidden="true"/>Descargar</a></DropdownMenuItem>
       :<DropdownMenuItem disabled title={STORAGE_REASON}><Download size={15} aria-hidden="true"/>Descargar</DropdownMenuItem>)}
      {admin&&<>
       <DropdownMenuItem {...busyProps} onClick={()=>onEdit({type:'edit',material})}><Pencil size={15} aria-hidden="true"/>Editar</DropdownMenuItem>
       {!archived&&<DropdownMenuItem {...busyProps} onClick={()=>onEdit({type:'version',material})}><Upload size={15} aria-hidden="true"/>Nueva versión</DropdownMenuItem>}
       {!archived&&material.source==='file'&&<DropdownMenuItem {...busyProps} onClick={()=>onEdit({type:'cover',material})}><ImagePlus size={15} aria-hidden="true"/>Portada</DropdownMenuItem>}
       <DropdownMenuSeparator/>
       <DropdownMenuItem {...busyProps} onClick={()=>onArchive(material)}>{archived?<RotateCcw size={15} aria-hidden="true"/>:<Archive size={15} aria-hidden="true"/>}{archived?'Restaurar':'Archivar'}</DropdownMenuItem>
      </>}
     </DropdownMenuContent></DropdownMenu>}
   </div>
   {admin&&(material.versions?.length??0)>1&&<Disclosure><DisclosureSummary>Versiones anteriores ({material.versions!.length-1})</DisclosureSummary><div className={styles.versions}>{material.versions!.slice(1).map(v=><p key={v.id}><a href={salesMaterialFileUrl({versionId:v.id,disposition:'attachment'})}>Versión {v.version}: {v.url?'enlace externo':v.fileName}</a> · {v.actorEmail} · {formatDateTime(v.createdAt)}</p>)}</div></Disclosure>}
  </div>
 </article>;
}
