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
        <span>Guía rápida para distinguir el negocio, sus gestiones y el seguimiento.</span>
      </span>
      <ChevronDown className={styles.helpChevron} size={18} aria-hidden="true"/>
    </DisclosureSummary>
    <dl>
      <dt>Negocio</dt><dd>Es la organización con la que nos relacionamos, por ejemplo una cabaña o un restaurante. Su nombre, ubicación y canales genéricos se comparten entre sus gestiones.</dd>
      <dt>Contacto</dt><dd>Es una persona de ese negocio, con su propio cargo, teléfono y email. Agregá una persona distinta por cada interlocutor; no uses el nombre del negocio como nombre de persona.</dd>
      <dt>Estado del negocio</dt><dd>Nuevo, Revisado, En gestión, Sin seguimiento programado, Recontactar y Archivado describen la situación general del negocio. Es cliente, No contactar y Derivado a Leandro son marcas independientes.</dd>
      <dt>Gestión</dt><dd>Cada gestión reúne su propio objetivo, etapa, comunicaciones e historial. Puede haber varias abiertas en el mismo negocio. El recorrido y los motivos de cierre dependen del tipo: verticales principales, Partners, Proveedores, Editores o Acompañamiento de ficha. No hace falta pasar por todas las etapas abiertas. Cerrar una gestión de verticales principales o Partners como ganada marca el negocio como cliente; otros tipos tienen reglas propias.</dd>
      <dt>Qué editar</dt><dd>“Editar negocio” cambia datos compartidos. “Editar gestión” cambia los datos de una sola gestión. Para actualizar una persona usá “Editar” en Contactos. Los estados del negocio y las etapas de gestión son conceptos separados.</dd>
      <dt>Contacto y cierre</dt><dd>Contactar permite elegir General o una gestión abierta. Email sale por Brevo; WhatsApp requiere confirmar el envío. Una respuesta o mensaje no cambia la etapa por sí solo. Al cerrar una gestión, completá el motivo pedido; “Otro” requiere una nota.</dd>
      <dt>Archivo y Papelera</dt><dd>Archivado requiere que un administrador desarchive el negocio antes de trabajarlo. Papelera bloquea todo hasta que un administrador lo restaure. No contactar bloquea todas las salidas y solo un administrador puede levantarlo.</dd>
    </dl>
    {children}
  </Disclosure>;
}
