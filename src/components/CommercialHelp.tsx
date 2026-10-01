import styles from "./Commercial.module.css";

export function CommercialHelp(){
  return <details className={styles.help}>
    <summary>Cómo usar negocios, contactos y oportunidades</summary>
    <dl>
      <dt>Negocio</dt><dd>Es la organización con la que nos relacionamos, por ejemplo una cabaña o un restaurante. Su nombre, ubicación y canales genéricos se comparten entre sus oportunidades.</dd>
      <dt>Contacto</dt><dd>Es una persona de ese negocio, con su propio cargo, teléfono y email. Agregá una persona distinta por cada interlocutor; no uses el nombre del negocio como nombre de persona.</dd>
      <dt>Oportunidad</dt><dd>La oportunidad es una venta o contratación concreta. Por ejemplo, la publicación de un alojamiento y una campaña adicional son dos oportunidades del mismo negocio. Su etapa indica cómo avanza esa venta; las notas y próximas acciones pertenecen a esa oportunidad.</dd>
      <dt>Qué editar</dt><dd>“Editar negocio” cambia datos compartidos. “Editar oportunidad” abre su clasificación y seguimiento completos. “Editar datos de venta” permite cambiar rápidamente nombre, servicio, etapa y persona. Para actualizar una persona usá “Editar” en Contactos.</dd>
      <dt>Prospecto y cliente</dt><dd>Prospecto es el negocio que todavía no convertimos a cliente. “Convertir a cliente” registra la decisión y su motivo; conserva el historial y no confirma pagos ni activa una suscripción en el portal turístico.</dd>
    </dl>
  </details>;
}
