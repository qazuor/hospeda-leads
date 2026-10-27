import {salesMaterialFileUrl,type SalesMaterial} from '../endpoints/salesMaterials.schema';
import {SALES_MATERIAL_FORMAT_LABELS,formatBytes,salesMaterialFormat,type SalesMaterialFormat} from '../helpers/salesMaterialTypes';
import {Badge} from './Badge';
import {Button} from './Button';
import {CrmDialog} from './ui/CrmDialog';
import styles from './SalesMaterial.module.css';

/** Formats the browser can show inline (spec 89 §12): image, PDF, video and audio. Office files and external links have no preview. */
export const PREVIEWABLE_FORMATS:ReadonlySet<SalesMaterialFormat>=new Set(['image','pdf','video','audio']);
/** True when the material's current version can be previewed inside the CRM. */
export const canPreviewSalesMaterial=({material}:{material:SalesMaterial}):boolean=>!!material.currentVersion&&!material.currentVersion.url&&PREVIEWABLE_FORMATS.has(salesMaterialFormat({mimeType:material.currentVersion.mimeType}));
/**
 * Detail with an inline preview of the current version through `/_api/sales_materials/file` (a fresh presigned URL per request, so video
 * seeking keeps working), the description, categories and «Descargar». Every user may open it; seeing a material grants nothing else.
 */
export function SalesMaterialPreview({material,onClose}:{material:SalesMaterial;onClose:()=>void}){
 const current=material.currentVersion;if(!current)return null;
 const format=salesMaterialFormat({mimeType:current.mimeType});const src=salesMaterialFileUrl({versionId:current.id});
 const media=format==='image'?<img src={src} alt={material.title}/>
  :format==='pdf'?<iframe src={src} title={'PDF: '+material.title}/>
  :format==='video'?<video src={src} controls preload="metadata" playsInline aria-label={material.title}/>
  :format==='audio'?<audio src={src} controls preload="metadata" aria-label={material.title}/>:null;
 return <CrmDialog opened onClose={onClose} title={material.title} description={`${SALES_MATERIAL_FORMAT_LABELS[format]} · versión ${current.version}`}>
  <div className={styles.preview}>
   {media&&<div className={styles.previewMedia} data-format={format}>{media}</div>}
   <div className={styles.badges}><Badge variant={material.kind==='deliverable'?'success':'warning'}>{material.kind==='deliverable'?'Entregable':'Interno'}</Badge>{material.categories.map(c=><Badge key={c.id} variant="outline">{c.name}</Badge>)}</div>
   {material.description&&<p className={styles.previewDescription}>{material.description}</p>}
   <p className={styles.meta}>{current.fileName??'Archivo'}{current.byteSize?' · '+formatBytes({bytes:current.byteSize}):''}</p>
   {material.kind==='internal'&&<p className={styles.meta}>Solo para vendedores: no se manda a clientes.</p>}
   <div className={styles.actions}>
    <Button asChild variant="outline" size="sm"><a href={src} target="_blank" rel="noopener noreferrer">Abrir en otra pestaña</a></Button>
    <Button asChild size="sm"><a href={salesMaterialFileUrl({versionId:current.id,disposition:'attachment'})}>Descargar</a></Button>
   </div>
  </div>
 </CrmDialog>;
}
