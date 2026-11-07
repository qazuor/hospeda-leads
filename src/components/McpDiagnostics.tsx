import {useQuery} from '@tanstack/react-query';
import {Badge} from './Badge';
import {Button} from './Button';
import {getMcpDiagnostics} from '../endpoints/mcp_diagnostics.schema';
import {QueryLoadingNotice} from './QueryLoadingNotice';
import {QueryErrorNotice} from './QueryErrorNotice';
import styles from '../pages/settings.module.css';
export function McpDiagnostics(){
 const q=useQuery({queryKey:['mcp-diagnostics'],queryFn:getMcpDiagnostics});
 if(q.isPending)return <QueryLoadingNotice/>;if(q.error)return <QueryErrorNotice error={q.error} onRetry={q.refetch} busy={q.isFetching}/>;
 const d=q.data;
 return <article className={styles.card} aria-label="Diagnóstico de conexión MCP"><div className={styles.cardTitle}><div><h2>Conexión MCP para ChatGPT</h2><p>Estado de solo lectura y datos para configurar el conector. No se muestran secretos.</p></div><Badge variant={d.enabled&&d.readerConnection==='ok'&&d.grantsComplete?'success':'warning'}>{d.enabled?'MCP habilitado':'MCP deshabilitado'}</Badge></div>
 <dl><dt>Configuración</dt><dd>{d.configOk?'Correcta':d.configProblem?`Revisar ${d.configProblem}`:'MCP deshabilitado'}</dd><dt>Conexión de lectura</dt><dd>{d.readerConnection==='ok'?'Disponible':d.readerConnection==='unsafe_role'?'Rol de lectura inseguro':d.readerConnection==='grants_incomplete'?'Permisos incompletos':'No disponible'}</dd><dt>Permisos del lector</dt><dd>{d.grantsComplete?'Completos':d.missingTables.length?`Faltan: ${d.missingTables.join(', ')}`:'No verificados'}</dd><dt>Última conexión exitosa de ChatGPT</dt><dd>{d.lastTokenIssuedAt?new Date(d.lastTokenIssuedAt).toLocaleString('es-AR'):'Todavía no hay una emisión registrada'}</dd></dl>
 <h3>Configuración de ChatGPT</h3><p>URL del servidor: <code>{d.url}</code></p><p>Client ID: <code>{d.clientId??'No disponible mientras MCP esté deshabilitado'}</code></p><p>Redirect URI: <code>{d.redirectUri}</code></p><p>Scopes: <code>{d.scopes.join(' ')}</code></p><ol><li>En ChatGPT, abrí Developer mode y agregá un conector MCP.</li><li>Usá la URL indicada y el Client ID mostrado. El Client Secret se mantiene privado en el servidor; ingresalo en el campo OAuth privado de ChatGPT si lo solicita.</li><li>Iniciá sesión como administrador autorizado en Hospeda y aceptá el acceso de lectura.</li></ol><Button variant="outline" onClick={()=>void q.refetch()} disabled={q.isFetching}>{q.isFetching?'Actualizando…':'Actualizar diagnóstico'}</Button>
 </article>;
}
