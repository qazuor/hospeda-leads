import { ChevronDown, CircleHelp } from "lucide-react";
import styles from "./Commercial.module.css";

export function CommercialHelp(){
  return <details className={styles.help}>
    <summary className={styles.helpSummary}>
      <CircleHelp className={styles.helpIcon} size={20} aria-hidden="true"/>
      <span className={styles.helpCopy}>
        <strong>Cómo usar negocios, contactos y oportunidades</strong>
        <span>Guía rápida para entender cada concepto y saber qué editar.</span>
      </span>
      <ChevronDown className={styles.helpChevron} size={18} aria-hidden="true"/>
    </summary>
    <dl>
      <dt>Negocio</dt><dd>Es la organización con la que nos relacionamos, por ejemplo una cabaña o un restaurante. Su nombre, ubicación y canales genéricos se comparten entre sus oportunidades.</dd>
      <dt>Contacto</dt><dd>Es una persona de ese negocio, con su propio cargo, teléfono y email. Agregá una persona distinta por cada interlocutor; no uses el nombre del negocio como nombre de persona.</dd>
      <dt>Oportunidad</dt><dd>La oportunidad es una venta o contratación concreta. Por ejemplo, la publicación de un alojamiento y una campaña adicional son dos oportunidades del mismo negocio. Su etapa indica cómo avanza esa venta; las notas y próximas acciones pertenecen a esa oportunidad.</dd>
      <dt>Qué editar</dt><dd>“Editar negocio” cambia datos compartidos. “Editar oportunidad” abre su clasificación y seguimiento completos. “Editar datos de venta” permite cambiar rápidamente nombre, servicio, etapa y persona. Para actualizar una persona usá “Editar” en Contactos.</dd>
      <dt>Prospecto y cliente</dt><dd>Prospecto es el negocio que todavía no convertimos a cliente. “Convertir a cliente” registra la decisión y su motivo; conserva el historial y no confirma pagos ni activa una suscripción en el portal turístico.</dd>
    </dl>
  </details>;
}
