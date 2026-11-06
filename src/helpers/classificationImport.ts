import type {AccountClassification} from './accountClassification';

export function parseClassificationImport(verticales:string|undefined,tipo?:string,subtipo?:string):AccountClassification[]{
 if(verticales?.trim())return verticales.split(';').map(value=>{const i=value.indexOf('/');return {tipo:(i<0?value:value.slice(0,i)).trim(),subtipo:i<0?null:value.slice(i+1).trim()||null};});
 return tipo?.trim()?[{tipo:tipo.trim(),subtipo:subtipo?.trim()||null}]:[];
}
