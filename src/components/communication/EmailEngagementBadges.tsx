import {Tooltip} from '@mantine/core';
import {emailEngagementBadges,type EmailEngagement} from '../../helpers/emailEngagement';
import {LAYERS} from '../../helpers/layers';
import styles from './CommunicationView.module.css';

/**
 * Spec 93 §2.3: informational badges of a sent email in the item header («Marcado como spam», «Abierto», «Posible apertura
 * automática», «Click en un enlace»). Each one explains itself in a tooltip on hover, focus and touch; clicked links are plain
 * text. They are not a reply, not contact and change nothing.
 */
export function EmailEngagementBadges({engagement}:{engagement:EmailEngagement|null|undefined}){
 return <>{emailEngagementBadges({engagement}).map(badge=><Tooltip key={badge.kind} label={badge.tooltip} events={{hover:true,focus:true,touch:true}} multiline w={280} withArrow openDelay={150} zIndex={LAYERS.tooltip}>
  <span className={styles.tag} data-kind="engagement" data-engagement={badge.kind} data-tone={badge.tone} tabIndex={0} aria-label={`${badge.label}. ${badge.tooltip}`}>{badge.label}</span>
 </Tooltip>)}</>;
}
