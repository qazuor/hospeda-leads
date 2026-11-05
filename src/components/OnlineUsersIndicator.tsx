import React from 'react';
import {Popover,Text} from '@mantine/core';
import {useQuery} from '@tanstack/react-query';
import {UsersRound} from 'lucide-react';
import type {UserRole} from '../helpers/schema';
import {getOnlineUsers} from '../endpoints/presence.schema';
import styles from './OnlineUsersIndicator.module.css';

export const ONLINE_USERS_QUERY_KEY=['presence','online'] as const;
export function relativePresenceTime(value:Date|string,now=Date.now()):string{
  const minutes=Math.max(0,Math.floor((now-new Date(value).getTime())/60_000));
  return minutes===0?'ahora':`hace ${minutes} min`;
}
export function OnlineUsersIndicator({role}:{role:UserRole|null}){
  const query=useQuery({queryKey:ONLINE_USERS_QUERY_KEY,queryFn:getOnlineUsers,enabled:role==='admin',refetchInterval:30_000,refetchIntervalInBackground:false,retry:false});
  const [opened,setOpened]=React.useState(false);
  if(role!=='admin')return null;
  const failed=query.isError;
  const count=failed?'—':query.data?.users.length??'…';
  return <Popover opened={opened} onChange={setOpened} position="bottom-end" withinPortal>
    <Popover.Target><button type="button" className={styles.trigger} aria-label={failed?'Estado de conexión no disponible':`${count} en línea`} aria-expanded={opened} onClick={()=>setOpened(value=>!value)}><span className={`${styles.dot} ${failed?styles.muted:''}`} aria-hidden="true"/><span>{failed?'—':`${count} en línea`}</span><UsersRound size={15} aria-hidden="true"/></button></Popover.Target>
    <Popover.Dropdown className={styles.dropdown}>
      <strong className={styles.title}>Usuarios en línea</strong>
      {query.isPending?<Text size="sm" c="dimmed">Cargando…</Text>:failed?<Text size="sm" c="dimmed">No se pudo cargar la lista.</Text>:query.data.users.length===0?<Text size="sm" c="dimmed">Nadie en línea</Text>:<ul className={styles.list}>{query.data.users.map(person=><li key={person.id}><span className={styles.person}><strong>{person.displayName}</strong><small>{person.role==='admin'?'Administrador':'Vendedor'} <span className={styles.sources}>{person.sources.map(source=><span key={source}>{source==='crm'?'CRM':source==='whatsapp'?'WhatsApp':'Instagram'}</span>)}</span></small></span><time>{relativePresenceTime(person.lastSeenAt)}</time></li>)}</ul>}
    </Popover.Dropdown>
  </Popover>;
}
