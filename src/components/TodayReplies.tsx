import {Link} from 'react-router-dom';
import {Mail,MessageCircle} from 'lucide-react';
import {relativeAgo} from '../helpers/crmDates';
import type {InboundReview} from '../endpoints/communication.schema';
import styles from './TodayReplies.module.css';
/** Shows the existing inbound review rows as compact channel cards. */
export function TodayReplies({rows}:{rows:InboundReview[]}){return <div className={styles.rows}>{rows.map(row=><article className={styles.row} key={row.id}><span className={styles.icon} data-channel={row.channel} aria-hidden="true">{row.channel==='whatsapp'?<MessageCircle size={17}/>:<Mail size={17}/>}</span><div className={styles.content}><div className={styles.top}><Link to={'/accounts/'+row.accountId}><strong>{row.accountName}</strong></Link><time>{relativeAgo(row.receivedAt)}</time></div><span className={styles.detail}>{[row.fromName||row.fromAddress,row.subject||'(sin asunto)'].filter(Boolean).join(' · ')}</span></div></article>)}</div>}
