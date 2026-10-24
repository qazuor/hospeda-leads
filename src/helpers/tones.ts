import {managementStageCatalog,managementTypes} from './businessManagement';
/** Named visual tone used by badges and semantic status labels. */
export type ToneName = 'blue' | 'green' | 'orange' | 'red' | 'violet' | 'sky' | 'pink' | 'slate';
/** HSL hue and saturation pair for stable tone generation. */
export type ToneHue = readonly [hue: number, saturation: number];
const tones: Record<ToneName, ToneHue> = { blue:[217,91],green:[142,71],orange:[38,92],red:[0,84],violet:[258,90],sky:[199,89],pink:[330,81],slate:[215,20] };
/** Returns the HSL pair associated with a named tone. */
export const toneHue = (tone: ToneName): ToneHue => tones[tone];
/** CSS token suffix for the tone, suitable for --tone-<name>-soft and -ink. */
export const toneToken = (tone: ToneName): string => tone;
/** Resolves a business or management status label to its named tone. */
export const toneOfStatus = (value: string): ToneName => { if(['constructor','__proto__','toString','hasOwnProperty'].includes(value))return 'slate'; const business={'Nuevo':'slate','Revisado':'sky','En gestión':'blue','Sin tarea agendada':'orange','Recontactar':'violet','Archivado':'slate'} as Record<string,ToneName>; if(Object.hasOwn(business,value))return business[value]; for(const type of managementTypes)for(const stage of managementStageCatalog(type))if(stage.label===value)return stage.classification==='won'?'green':stage.classification==='lost'?'red':'blue'; return 'slate'; };
/** Resolves review, priority, and stage classifications to a named tone. */
export const toneOfValue = (category: string, value: string): ToneName => {
 if(category==='status') return toneOfStatus(value);
 if(category==='review') return value==='Revisado'?'green':value==='No revisado'?'sky':'slate';
 if(category==='priority') return value.toLocaleLowerCase('es-AR')==='alta'?'red':value.toLocaleLowerCase('es-AR')==='media'?'orange':value.toLocaleLowerCase('es-AR')==='baja'?'green':'slate';
 return 'slate';
};
