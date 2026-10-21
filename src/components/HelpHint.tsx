import {useState} from 'react';
import {CircleHelp} from 'lucide-react';
import {GLOSSARY,type GlossaryKey} from '../content/glossary';
import {Popover,PopoverContent,PopoverTrigger} from './Popover';
import styles from './HelpHint.module.css';

/**
 * "ⓘ ¿Qué es esto?" next to a concept label (report item 5.2). Opens a popover with the glossary definition.
 * The trigger has an accessible name that starts with its visible text and then names the term (WCAG 2.5.3), e.g. "¿Qué es esto? Etapa". The popover only holds text, so focus stays on the trigger (no focus trap) and Esc on the trigger closes it.
 */
export function HelpHint({term,iconOnly=false}:{term:GlossaryKey;iconOnly?:boolean}){
 const entry=GLOSSARY[term];
 const [open,setOpen]=useState(false);
 return <Popover open={open} onOpenChange={setOpen}>
  <PopoverTrigger className={styles.trigger} aria-label={`¿Qué es esto? ${entry.term}`} aria-expanded={open} onKeyDown={event=>{if(event.key==='Escape'&&open){event.stopPropagation();setOpen(false);}}} style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:'0.85em',color:'var(--mantine-color-dimmed)',verticalAlign:'middle'}}>
   <CircleHelp size={16} aria-hidden="true"/>{!iconOnly&&<span aria-hidden="true">¿Qué es esto?</span>}
  </PopoverTrigger>
  <PopoverContent aria-label={entry.term} onOpenAutoFocus={event=>event.preventDefault()} style={{maxWidth:320}}><strong>{entry.term}</strong><p style={{margin:'4px 0 0'}}>{entry.definition}</p></PopoverContent>
 </Popover>;
}
