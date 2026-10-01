import styles from "./Commercial.module.css";

export function CommercialHelp(){
  return <details className={styles.help}>
    <summary>Cómo usar negocios, contactos y oportunidades</summary>
    <dl>
      <dt>Cuenta / negocio</dt><dd>Es la organización con la que nos relacionamos, por ejemplo una cabaña o un restaurante. Su nombre, ubicación y canales genéricos se comparten entre sus oportunidades.</dd>
      <dt>Contacto</dt><dd>Es una persona de ese negocio, con su propio cargo, teléfono y email. Agregá una persona distinta por cada interlocutor; no uses el nombre del negocio como nombre de persona.</dd>
      <dt>Oportunidad y lead</dt><dd>La oportunidad es una venta o contratación concreta. Por ejemplo, la publicación de un alojamiento y una campaña adicional son dos oportunidades del mismo negocio. Cada lead representa una oportunidad y conserva sus notas, etapa y seguimiento.</dd>
      <dt>Qué editar</dt><dd>“Editar negocio” cambia datos compartidos. “Editar oportunidad” cambia esa venta. “Editar lead” abre el formulario completo de clasificación y seguimiento; los campos generales del negocio que contiene también se comparten.</dd>
      <dt>Prospecto y cliente</dt><dd>Prospecto es el negocio que todavía no convertimos a cliente. “Convertir a cliente” registra la decisión y su motivo; conserva el historial y no confirma pagos ni activa una suscripción en el portal turístico.</dd>
    </dl>
  </details>;
}
