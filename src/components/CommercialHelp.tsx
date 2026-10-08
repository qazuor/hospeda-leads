import { Disclosure, DisclosureSummary } from './Disclosure';
import type {ReactNode} from "react";
import { ChevronDown, CircleHelp } from "lucide-react";
import styles from "./Commercial.module.css";

export function CommercialHelp({children}:{children?:ReactNode}){
  return <Disclosure className={styles.help}>
    <DisclosureSummary className={styles.helpSummary}>
      <CircleHelp className={styles.helpIcon} size={20} aria-hidden="true"/>
      <span className={styles.helpCopy}>
        <strong>Cómo usar negocios, contactos y gestiones</strong>
        <span>Guía rápida para entender cada concepto y saber qué editar.</span>
      </span>
      <ChevronDown className={styles.helpChevron} size={18} aria-hidden="true"/>
    </DisclosureSummary>
    <dl>
      <dt>Negocio</dt><dd>Es la organización con la que nos relacionamos, por ejemplo una cabaña o un restaurante. Su nombre, ubicación y canales genéricos se comparten entre sus gestiones.</dd>
      <dt>Contacto</dt><dd>Es una persona de ese negocio, con su propio cargo, teléfono y email. Agregá una persona distinta por cada interlocutor; no uses el nombre del negocio como nombre de persona.</dd>
      <dt>Gestión</dt><dd>La gestión reúne una propuesta, sus conversaciones y próximos pasos. Por ejemplo, la publicación de un alojamiento y una campaña adicional son dos gestiones del mismo negocio. Su etapa indica cómo avanza esa gestión; las notas y próximas acciones pertenecen a esa gestión.</dd>
      <dt>Qué editar</dt><dd>“Editar negocio” cambia datos compartidos. “Editar gestión” abre su clasificación y seguimiento completos. “Editar datos de gestión” permite cambiar rápidamente nombre, servicio, etapa y persona. Para actualizar una persona usá “Editar” en Contactos.</dd>
      <dt>Prospecto y cliente</dt><dd>Prospecto es el negocio que todavía no convertimos a cliente. “Convertir a cliente” registra la decisión y su motivo; conserva el historial y no confirma pagos ni activa una suscripción en el portal turístico.</dd>
    </dl>
    {children}
  </Disclosure>;
}
