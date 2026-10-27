import {useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {getSalesMaterials,postSalesMaterial,type SalesMaterialCategory} from '../endpoints/salesMaterials.schema';
import {QueryErrorNotice} from './QueryErrorNotice';
import {QueryLoadingNotice} from './QueryLoadingNotice';
import {Button} from './Button';
import {Input} from './Input';
import styles from './SalesMaterial.module.css';

const BUSY='La operación está en curso. Esperá a que termine para continuar.';
/** Configuración → «Categorías de material»: the admin creates, renames, deactivates and reactivates the team's categories. */
export function SalesMaterialCategories(){
 const qc=useQueryClient();
 const q=useQuery({queryKey:['sales-materials','categories'],queryFn:()=>getSalesMaterials()});
 const [name,setName]=useState(''),[editing,setEditing]=useState<{id:string;name:string}|null>(null);
 const [pending,setPending]=useState(''),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const lock=useRef(false);
 async function run(input:Parameters<typeof postSalesMaterial>[0],label:string,done:string){
  if(lock.current)return;lock.current=true;setPending(label);setError('');setNotice('');
  try{await postSalesMaterial(input);await qc.invalidateQueries({queryKey:['sales-materials']});setNotice(done);if(input.action==='category_create')setName('');else setEditing(null);}
  catch(e){setError((e instanceof Error?e.message:'No se pudo guardar la categoría.')+' Lo que escribiste se conserva.')}
  finally{lock.current=false;setPending('')}
 }
 const busy=!!pending;
 const toggle=(c:SalesMaterialCategory)=>void run({action:'category_update',id:c.id,name:c.name,active:!c.active},'Guardando categoría…',c.active?`«${c.name}» quedó desactivada: no se ofrece para material nuevo y sigue en el que ya la tiene.`:`«${c.name}» volvió a estar activa.`);
 return <section className={styles.form} aria-busy={busy}>
  <header><h2>Categorías de material</h2><p className={styles.hint}>Las categorías ordenan el «Material de venta» y son del equipo. Un material puede tener varias. Desactivar una no la quita del material que ya la usa.</p></header>
  <form className={styles.inline} onSubmit={e=>{e.preventDefault();if(name.trim().length>=2)void run({action:'category_create',name:name.trim()},'Creando categoría…','Categoría creada.')}}>
   <label>Nombre de la categoría<Input value={name} maxLength={100} disabled={busy} onChange={e=>setName(e.target.value)} placeholder="Ej.: Folletos"/></label>
   <Button type="submit" disabled={busy||name.trim().length<2} disabledReason={busy?BUSY:'Escribí un nombre de 2 letras o más.'}>Agregar categoría</Button>
  </form>
  {busy&&<p role="status">{pending}</p>}{notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
  {q.isPending?<QueryLoadingNotice>Cargando categorías…</QueryLoadingNotice>:!q.data?<QueryErrorNotice error={q.error!} onRetry={q.refetch} busy={q.isFetching} label="Reintentar categorías"/>:
   q.data.categories.length===0?<p className={styles.hint}>Todavía no hay categorías.</p>:
   <ul className={styles.categoryList}>{q.data.categories.map(c=><li key={c.id}>
    {editing?.id===c.id?<form className={styles.inline} onSubmit={e=>{e.preventDefault();if(editing.name.trim().length>=2)void run({action:'category_update',id:c.id,name:editing.name.trim(),active:c.active},'Guardando categoría…','Categoría renombrada.')}}>
     <label>Nuevo nombre<Input value={editing.name} maxLength={100} disabled={busy} autoFocus onChange={e=>setEditing({id:c.id,name:e.target.value})}/></label>
     <Button type="submit" size="sm" disabled={busy||editing.name.trim().length<2} disabledReason={busy?BUSY:'Escribí un nombre de 2 letras o más.'}>Guardar nombre</Button>
     <Button size="sm" variant="ghost" disabled={busy} disabledReason={BUSY} onClick={()=>setEditing(null)}>Cancelar</Button>
    </form>:<><span>{c.name}{c.active?'':' · desactivada'}</span><span className={styles.actions}>
     <Button size="sm" variant="ghost" disabled={busy} disabledReason={BUSY} onClick={()=>setEditing({id:c.id,name:c.name})}>Renombrar</Button>
     <Button size="sm" variant="ghost" disabled={busy} disabledReason={BUSY} onClick={()=>toggle(c)}>{c.active?'Desactivar':'Activar'}</Button>
    </span></>}
   </li>)}</ul>}
 </section>;
}
