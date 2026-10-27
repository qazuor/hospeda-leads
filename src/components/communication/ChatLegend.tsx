import {CircleHelp} from 'lucide-react';
import {Popover,PopoverContent,PopoverTrigger} from '../Popover';
import styles from './CommunicationView.module.css';

const PLATFORMS=[['whatsapp','WhatsApp'],['instagram','Instagram'],['email','Email'],['call','Llamada'],['other','Otra red']] as const;

/**
 * Spec 91 owner review: «Cómo leer el chat», a compact legend opened by click or tap from the «Conversación» header. It explains
 * the side, the background, the platform colours, the dashed border and the centred boxes.
 */
export function ChatLegend(){
 return <Popover>
  <PopoverTrigger className={styles.legendButton} aria-label="Cómo leer el chat" title="Cómo leer el chat"><CircleHelp size={16} aria-hidden="true"/></PopoverTrigger>
  <PopoverContent aria-label="Cómo leer el chat" className={styles.legend} side="bottom" align="start">
   <strong className={styles.legendTitle}>Cómo leer el chat</strong>
   <dl>
    <dt>Lado</dt><dd>Derecha: lo enviamos nosotros. Izquierda: lo envió el negocio.</dd>
    <dt>Fondo</dt><dd>Teñido: enviado por nosotros. Blanco con borde de color: recibido.</dd>
    <dt>Color</dt><dd><ul className={styles.legendSwatches}>{PLATFORMS.map(([channel,label])=><li key={channel}><span className={styles.chipDot} data-channel={channel} aria-hidden="true"/>{label}</li>)}</ul></dd>
    <dt>Borde punteado</dt><dd>Abrimos el canal pero no sabemos si se envió; confirmalo con «Sí, se envió» o «No se envió».</dd>
    <dt>Caja centrada</dt><dd>Una llamada o una respuesta registrada sin mensaje.</dd>
   </dl>
  </PopoverContent>
 </Popover>;
}
