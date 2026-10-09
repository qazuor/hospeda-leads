import {CrmResponsiveNavigation} from './ui/CrmResponsiveNavigation';
import {useGuardedMutation} from '../helpers/useGuardedMutation';
import { UnstyledButton } from '@mantine/core';
import {useState} from 'react';
import { useQueryClient} from '@tanstack/react-query';
import {Link} from 'react-router-dom';
import {ArrowRight, MapPin, Pencil, Plus, Tags, Trash2} from 'lucide-react';
import type {SettingsOutput} from '../endpoints/settings_GET.schema';
import {postSettingsSave} from '../endpoints/settings_save_POST.schema';
import {Button} from './Button';
import {Input} from './Input';
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from './Dialog';
import {SectionTabs, SectionTabList, SectionTab, SectionTabPanel} from './SectionTabs';
import styles from './ClassificationSettings.module.css';

type Subtype = SettingsOutput['subtypes'][number];
const matches = (name: string, term: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').includes(term.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim());

export function ClassificationSettings({data}: {data: SettingsOutput}) {
  const qc = useQueryClient();
  const [group, setGroup] = useState(data.types[0] ?? '__GENERAL__');
  const [search, setSearch] = useState('');
  const [citySearch, setCitySearch] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [city, setCity] = useState('');
  const [editing, setEditing] = useState<Subtype | null>(null);
  const [deleting, setDeleting] = useState<Subtype | null>(null);
  const [notice, setNotice] = useState('');
  const save = useGuardedMutation({mutationFn: postSettingsSave, onSuccess: async () => {
    await qc.invalidateQueries({queryKey: ['settings']});
  }});
  const typeName = group === '__GENERAL__' ? null : group;
  const label = typeName ?? 'Generales';
  const groups = [...data.types.map(name => ({key: name, label: name})), {key: '__GENERAL__', label: 'Generales'}];
  const items = data.subtypes.filter(item => item.typeName === typeName).sort((a,b) => a.name.localeCompare(b.name, 'es'));
  const filtered = items.filter(item => matches(item.name, search));
  const cities = data.cities.filter(item => matches(item.name, citySearch)).sort((a,b) => a.name.localeCompare(b.name, 'es'));
  const draft = drafts[group] ?? '';
  function addSubtype() {
    const name = draft.trim();
    if (!name || save.isPending) return;
    save.mutate({action: 'addSubtype', name, typeName}, {onSuccess: () => {
      setDrafts(prev => ({...prev, [group]: ''})); setSearch(''); setNotice('Subtipo agregado: ' + name);
    }});
  }
  return <section className={styles.root}>
    <header className={styles.heading}>
      <div className={styles.icon}><Tags size={24}/></div>
      <div><h2>Clasificaciones de negocios</h2><p>Organizá las opciones que aparecen al cargar un negocio y al buscarlo.</p></div>
    </header>
    <SectionTabs defaultValue="subtypes" onValueChange={() => {if (!save.isPending) save.reset(); setNotice('');}}>
      <SectionTabList aria-label="Catálogos de negocios"><SectionTab value="subtypes"><Tags size={16}/>Verticales y subtipos</SectionTab><SectionTab value="cities"><MapPin size={16}/>Ciudades</SectionTab></SectionTabList>
      {save.error && <p className={styles.error} role="alert">{save.error.message}</p>}
      <p className={styles.notice} role="status">{notice}</p>
      <SectionTabPanel value="subtypes">
        <div className={styles.workspace}>
          <CrmResponsiveNavigation label="Vertical" value={group} disabled={save.isPending} options={groups.map(g=>({value:g.key,label:g.label}))} onChange={value=>{setGroup(value);setSearch('');setNotice('');save.reset();}}><aside className={styles.groups} aria-label="Elegir vertical">
            <div className={styles.groupHeading}>Elegí una vertical<span>El rubro principal del negocio</span></div>
            {groups.map(g => <UnstyledButton type="button" key={g.key} disabled={save.isPending} aria-pressed={group === g.key} onClick={() => {setGroup(g.key); setSearch(''); setNotice(''); save.reset();}}><span>{g.label}</span><span className={styles.count}>{data.subtypes.filter(item => item.typeName === (g.key === '__GENERAL__' ? null : g.key)).length}</span></UnstyledButton>)}
          </aside></CrmResponsiveNavigation>
          <article className={styles.card}>
            <header className={styles.cardHeading}><div><span className={styles.eyebrow}>{typeName ? 'VERTICAL' : 'COMPARTIDOS'}</span><h3>{label}</h3><p>{typeName ? 'Los subtipos describen qué clase de negocio es dentro de este rubro.' : 'Estos subtipos se pueden elegir en cualquier vertical.'}</p></div><span className={styles.count}>{items.length} {items.length === 1 ? 'subtipo' : 'subtipos'}</span></header>
            <form className={styles.addForm} onSubmit={e => {e.preventDefault(); addSubtype();}}>
              <label>Nuevo subtipo<Input value={draft} onChange={e => setDrafts(prev => ({...prev, [group]: e.target.value}))} placeholder="Nombre del subtipo" maxLength={120}/></label>
              <Button type="submit" disabled={save.isPending || !draft.trim()}><Plus size={16}/>Agregar subtipo</Button>
            </form>
            <div className={styles.listHeading}><label>Buscar en {label}<Input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Escribí un nombre…"/></label><span>{filtered.length} de {items.length}</span></div>
            <ul className={styles.list}>{filtered.map(item => <li key={item.id}><span>{item.name}</span><div><Button variant="ghost" size="sm" disabled={save.isPending} aria-label={'Editar ' + item.name} onClick={() => {save.reset(); setEditing(item);}}><Pencil size={14}/>Editar</Button><Button variant="ghost" size="icon-sm" aria-label={'Eliminar ' + item.name} title={'Eliminar ' + item.name} disabled={save.isPending} onClick={() => {save.reset(); setDeleting(item);}}><Trash2 size={15}/></Button></div></li>)}</ul>
            {!filtered.length && <div className={styles.empty}>{items.length ? 'No hay subtipos que coincidan con la búsqueda.' : 'Todavía no hay subtipos. Agregá el primero con el formulario de arriba.'}</div>}
          </article>
        </div>
      </SectionTabPanel>
      <SectionTabPanel value="cities">
        <article className={styles.card}>
          <header className={styles.cardHeading}><div><span className={styles.eyebrow}>UBICACIÓN</span><h3>Ciudades</h3><p>Localidades disponibles al cargar negocios y al filtrar las listas.</p></div><span className={styles.count}>{data.cities.length} {data.cities.length === 1 ? 'ciudad' : 'ciudades'}</span></header>
          <form className={styles.addForm} onSubmit={e => {e.preventDefault(); if (!city.trim() || save.isPending) return; save.mutate({action: 'addCity', name: city.trim()}, {onSuccess: () => {setNotice('Ciudad agregada: ' + city.trim()); setCity(''); setCitySearch('');}});}}>
            <label>Nueva ciudad<Input value={city} onChange={e => setCity(e.target.value)} placeholder="Nombre de la ciudad" maxLength={120}/></label><Button type="submit" disabled={save.isPending || !city.trim()}><Plus size={16}/>Agregar ciudad</Button>
          </form>
          <div className={styles.listHeading}><label>Buscar ciudad<Input type="search" value={citySearch} onChange={e => setCitySearch(e.target.value)} placeholder="Escribí una localidad…"/></label><span>{cities.length} de {data.cities.length}</span></div>
          <ul className={styles.cities}>{cities.map(item => <li key={item.id}><MapPin size={15}/>{item.name}</li>)}</ul>
          {!cities.length && <div className={styles.empty}>No hay ciudades que coincidan con la búsqueda.</div>}
        </article>
      </SectionTabPanel>
    </SectionTabs>
    <Link className={styles.related} to="/settings?section=process"><div><strong>¿Buscás etapas de gestión o tipos de tareas?</strong><span>Ahora están en Proceso comercial, junto con las reglas de seguimiento.</span></div><ArrowRight size={20}/></Link>
    <Dialog open={!!editing} onOpenChange={open => {if (!open && !save.isPending) setEditing(null);}}><DialogContent>
      <DialogHeader><DialogTitle>Editar subtipo</DialogTitle><DialogDescription>Pertenece a {editing?.typeName ?? 'Generales'}. Guardar también actualiza el nombre en los registros que usan este subtipo.</DialogDescription></DialogHeader>
      <form onSubmit={e => {e.preventDefault(); if (!editing?.name.trim() || save.isPending) return; save.mutate({action: 'editSubtype', id: editing.id, name: editing.name.trim()}, {onSuccess: () => {setEditing(null); setNotice('Subtipo actualizado.');}});}}>
        <label className={styles.field}>Nombre del subtipo<Input autoFocus required maxLength={120} value={editing?.name ?? ''} onChange={e => setEditing(prev => prev ? {...prev, name: e.target.value} : prev)}/></label>
        {save.error && <p role="alert">{save.error.message}</p>}
        <DialogFooter><Button variant="outline" disabled={save.isPending} onClick={() => setEditing(null)}>Cancelar</Button><Button type="submit" disabled={save.isPending || !editing?.name.trim()}>{save.isPending ? 'Guardando…' : 'Guardar cambios'}</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>
    <Dialog open={!!deleting} onOpenChange={open => {if (!open && !save.isPending) setDeleting(null);}}><DialogContent>
      <DialogHeader><DialogTitle>Eliminar subtipo</DialogTitle><DialogDescription><strong>{deleting?.name}</strong> dejará de estar disponible para nuevas selecciones. Los registros existentes conservarán el valor que tenían.</DialogDescription></DialogHeader>
      {save.error && <p role="alert">{save.error.message}</p>}
      <DialogFooter><Button variant="outline" disabled={save.isPending} onClick={() => setDeleting(null)}>Cancelar</Button><Button variant="destructive" disabled={save.isPending} onClick={() => {if (!deleting) return; save.mutate({action: 'deleteSubtype', id: deleting.id}, {onSuccess: () => {setDeleting(null); setNotice('Subtipo eliminado de las opciones disponibles.');}});}}>{save.isPending ? 'Eliminando…' : 'Eliminar subtipo'}</Button></DialogFooter>
    </DialogContent></Dialog>
  </section>;
}
