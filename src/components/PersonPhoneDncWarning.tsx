import {Checkbox} from './Checkbox';
import type {DuplicateCandidate} from '../endpoints/business_duplicate_check.schema';
import styles from './Commercial.module.css';

/** Shown when a person's phone is exactly the phone of a No contactar business (decision 13B): it warns, never blocks, and the seller confirms she read it. Reveals only the name and city the duplicate check already exposes to every seller. */
export function PersonPhoneDncWarning({matches,acknowledged,onAcknowledge,disabled}:{matches:readonly DuplicateCandidate[];acknowledged:boolean;onAcknowledge:(value:boolean)=>void;disabled?:boolean}){
 if(!matches.length)return null;
 return <section role="note" aria-label="Teléfono de un negocio No contactar" style={{display:'grid',gap:8,padding:12,border:'1px solid var(--error)',borderRadius:10}}>
  <p style={{margin:0}}><strong>Este teléfono es de un negocio que pidió no ser contactado: {matches.map(c=>c.ciudad?`${c.nombre} (${c.ciudad})`:c.nombre).join(', ')}.</strong> Podés guardar a la persona. No uses este teléfono para contactar sin consultar a un administrador.</p>
  <label className={styles.checkbox}><Checkbox disabled={disabled} checked={acknowledged} onChange={e=>onAcknowledge(e.target.checked)}/>Entendido, no voy a contactar a ese negocio</label>
 </section>;
}

/** Decision D2: shown at contact time (Contactar, call panel, task, message composer) when the chosen person's phone is exactly a No contactar business's phone. It never blocks and has nothing to dismiss: the server computes it on every read, so the next viewer sees it too. */
export function PersonPhoneDncNotice({businesses}:{businesses?:readonly {nombre:string;ciudad:string|null}[]|null}){
 if(!businesses?.length)return null;
 return <section role="note" aria-label="Teléfono de un negocio No contactar" style={{padding:12,border:'1px solid var(--error)',borderRadius:10}}>
  <p style={{margin:0}}><strong>Este teléfono es de un negocio que pidió no ser contactado: {businesses.map(b=>b.ciudad?`${b.nombre} (${b.ciudad})`:b.nombre).join(', ')}.</strong> No uses este teléfono para contactar sin consultar a un administrador.</p>
 </section>;
}
