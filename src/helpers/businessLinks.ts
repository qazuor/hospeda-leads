import {instagramProfileUrl,normalizeInstagramUsername} from './instagramChat';
import {splitEmptyFields} from './emptyFields';

/** Link fields of a business, shown in the «Enlaces» group of «Datos del negocio» (spec 104). */
export const BUSINESS_LINK_FIELDS=['sitioWeb','urlGmap','perfilInstagram','perfilFacebook','perfilAirbnb','perfilBooking','perfilTurismoEntreRios'] as const;
/** One of {@link BUSINESS_LINK_FIELDS}. */
export type BusinessLinkField=typeof BUSINESS_LINK_FIELDS[number];

const SCHEME=/^[a-z][a-z0-9+.-]*:/i,DOMAIN=/^[^\s/:@]+\.[a-z]{2,}(?:[/?#]\S*)?$/i;

/**
 * Safe href for a stored business link, or null when it is not a navigable web address.
 * Only `http:` and `https:` survive (never `javascript:`, `data:` or other schemes); a bare domain gets `https://`;
 * Instagram accepts a username or a profile URL and always points at the profile. Opening it records nothing.
 * @example businessLinkHref({field:'sitioWeb',value:'cabanas.com.ar'}) // "https://cabanas.com.ar/"
 */
export function businessLinkHref({field,value}:{field:BusinessLinkField;value:unknown}):string|null{
 const text=typeof value==='string'?value.trim():'';
 if(!text)return null;
 if(field==='perfilInstagram')return instagramProfileUrl({username:normalizeInstagramUsername(text)});
 const candidate=SCHEME.test(text)?text:DOMAIN.test(text)?'https://'+text:null;
 if(!candidate)return null;
 try{const url=new URL(candidate);return url.protocol==='http:'||url.protocol==='https:'?url.href:null;}catch{return null;}
}

/**
 * Splits the link fields of a business into loaded links (trimmed value plus its safe href, null when not navigable)
 * and the labels of the empty ones, which the record lists under «Sin cargar».
 */
export function businessLinkFacts({value,labels}:{value:(field:BusinessLinkField)=>unknown;labels:Readonly<Partial<Record<string,string>>>}){
 const split=splitEmptyFields(BUSINESS_LINK_FIELDS,value),label=(field:BusinessLinkField)=>labels[field]??field;
 return {links:split.populated.map(field=>{const text=String(value(field)).trim();return {field,label:label(field),value:text,href:businessLinkHref({field,value:text})};}),emptyLabels:split.empty.map(label)};
}
