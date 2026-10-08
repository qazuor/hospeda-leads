import { useRef, useState } from 'react';
import { Paper, Select } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2 } from 'lucide-react';
import { getCommercialDetail } from '../endpoints/commercial.schema';
import { getWork } from '../endpoints/work.schema';
import { postResource, type ResourceDocument, type ResourceVersion } from '../endpoints/resources.schema';
import { canModifyManagement } from '../helpers/crmPermissions';
import { useAuth } from '../helpers/useAuth';
import { Button } from './Button';
import { LibraryResourceSelect } from './LibraryResourceSelect';
import styles from './Communication.module.css';

export function ResourceLinkForm({ accountId, leadId, documents, loading, error, onRetry, onPreview }: {
  accountId: string; leadId?: string; documents: ResourceDocument[]; loading: boolean;
  error?: Error | null; onRetry: () => void; onPreview: (version: ResourceVersion) => void;
}) {
  const { authState } = useAuth();
  const user = authState.type === 'authenticated' ? authState.user : undefined;
  const qc = useQueryClient(), lock = useRef(false);
  const [documentId, setDocumentId] = useState(''), [selectedLead, setSelectedLead] = useState(''), [activityId, setActivityId] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const detail = useQuery({ queryKey: ['commercial-detail', accountId, ''], queryFn: () => getCommercialDetail(accountId) });
  const work = useQuery({ queryKey: ['work', 'resource-context', accountId], queryFn: () => getWork({ accountId, mode: 'detail', responsible: user?.role === 'admin' ? 'all' : undefined }) });
  const targetLead = leadId || selectedLead;
  const targetName = targetLead ? detail.data?.opportunities.find(o => String(o.id) === targetLead)?.opportunityName || 'Gestión comercial inicial' : 'Documento general del negocio';
  const selected = documents.find(d => d.id === documentId && d.status === 'approved');
  const mutation = useMutation({ mutationFn: postResource, onSuccess: (_result, input) => {
    if (input.action !== 'link') return;
    setConfirmation(`«${selected?.title || 'Documento'}» quedó vinculado a ${targetName}. No se envió al cliente.`);
    setDocumentId('');
    void qc.invalidateQueries({ queryKey: ['resources'] });
  }, onSettled: () => { lock.current = false; } });
  const busy = mutation.isPending;
  const contextLoading = detail.isPending || work.isPending;
  const contextError = detail.error || work.error;
  const blocked = busy || loading || contextLoading || !!error || !!contextError;
  function resetFeedback() { mutation.reset(); setConfirmation(''); }
  function link() {
    if (lock.current || blocked || !selected) return;
    lock.current = true; setConfirmation('');
    mutation.mutate({ action: 'link', id: selected.id, accountId, leadId: targetLead || null, activityId: activityId || null });
  }
  return <Paper component="section" withBorder p="md" radius="md" className={styles.materialContext} aria-label="Vincular material aprobado" aria-busy={busy}>
    <h3><Link2 size={18} aria-hidden="true"/>Vincular material aprobado</h3>
    <p>Elegí el material y revisá dónde quedará registrado. Vincularlo no lo envía al cliente.</p>
    <LibraryResourceSelect documents={documents} value={documentId} onChange={id => { setDocumentId(id); resetFeedback(); }} onPreview={onPreview} loading={loading} disabled={blocked}/>
    {error && <div role="alert"><p>{error.message}</p><Button variant="outline" onClick={onRetry}>Reintentar biblioteca</Button></div>}
    {contextLoading && <p role="status">Cargando contexto del material…</p>}
    {contextError && <div role="alert"><p>{contextError.message}</p><Button variant="outline" onClick={() => { void detail.refetch(); void work.refetch(); }}>Reintentar contexto</Button></div>}
    {!leadId && <Select label="Vincular a" value={selectedLead} allowDeselect={false} searchable disabled={blocked}
      data={[{ value: '', label: 'Documento general del negocio' }, ...(detail.data?.opportunities.filter(o => canModifyManagement(user, o, detail.data?.account)).map(o => ({ value: String(o.id), label: o.opportunityName || 'Gestión comercial inicial' })) || [])]}
      onChange={value => { setSelectedLead(value || ''); setActivityId(''); resetFeedback(); }}/>}
    <Select label="Actividad vinculada al material (opcional)" value={activityId} allowDeselect={false} searchable disabled={blocked}
      data={[{ value: '', label: 'Sin actividad específica' }, ...(work.data?.activities.filter(a => !targetLead || String(a.leadId) === targetLead).map(a => ({ value: String(a.id), label: `${a.title} · ${new Date(a.occurredAt).toLocaleDateString('es-AR')}` })) || [])]}
      onChange={value => { setActivityId(value || ''); resetFeedback(); }}/>
    <p className={styles.materialTarget}>Destino: <strong>{detail.data?.account.nombre || 'Negocio'} · {targetName}</strong></p>
    <div className={styles.actions}><Button disabled={blocked || !selected} onClick={link}>{busy ? 'Vinculando documento…' : leadId ? 'Vincular documento a la gestión' : 'Vincular documento al negocio'}</Button></div>
    {mutation.error && <p role="alert">{mutation.error.message} Tu selección se conserva; podés volver a intentar.</p>}
    {confirmation && <p role="status">{confirmation}</p>}
    {busy && <span hidden data-unsaved="true"/>}
  </Paper>;
}
