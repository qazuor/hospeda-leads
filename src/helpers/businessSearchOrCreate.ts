import type {BusinessPrefill} from '../components/BusinessQuickCreate';
import {normalizeInstagramUsername} from './instagramChat';

/** Query params of «Buscar o crear en el CRM» (spec 98 §17): `q` is the search, `createPhone` / `createInstagram` the creation prefill. */
export const SEARCH_OR_CREATE_PARAMS=['q','createPhone','createInstagram'] as const;
/** What the Negocios list does with them: apply `query`, and offer creating a business with `prefill` when nothing is found. */
export type SearchOrCreate={query:string;prefill:BusinessPrefill|null};

/** Shown instead of «Crear negocio con este…» when filters are active: the business may exist but be hidden by them. */
export const SEARCH_OR_CREATE_FILTERS_HINT='Hay filtros activos que pueden ocultar el negocio. Buscá en todos los negocios antes de crearlo.';
const PHONE=/^\+?\d{6,20}$/;
/**
 * Reads the params the user script panels put in the Negocios link. Null without a usable `q`. A prefill is kept only when it is a plain phone
 * (6–20 digits, optionally with a leading `+`) or a valid Instagram username; anything else is ignored (the search still applies). Never creates anything.
 */
export function readSearchOrCreate(params:URLSearchParams):SearchOrCreate|null{
 const query=(params.get('q')??'').trim().slice(0,200);
 if(!query)return null;
 const phone=(params.get('createPhone')??'').trim(),instagram=normalizeInstagramUsername(params.get('createInstagram'));
 const prefill:BusinessPrefill|null=instagram?{instagram:'@'+instagram}:PHONE.test(phone)?{telefono:phone}:null;
 return {query,prefill};
}
