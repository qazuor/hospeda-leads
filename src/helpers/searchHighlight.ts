import {normalizeSearchText} from './searchText';

/** A match range in the original text: `start` inclusive, `end` exclusive, in UTF-16 code units of the source string. */
export type SearchMatch={readonly start:number;readonly end:number};

/**
 * Locates `query` inside `text` with the same equivalence as the server search (accents ignored, ñ kept distinct from n),
 * and returns the range in the ORIGINAL text so it can be highlighted. Each base character is normalized together with its
 * combining marks, so decomposed input (e + U+0301, n + U+0303) maps back to the right characters.
 */
export function findSearchMatch({text,query}:{text:string;query:string}):SearchMatch|null{
 const needle=normalizeSearchText(query);
 if(!needle)return null;
 let normalized='';const origin:number[]=[];
 for(const cluster of text.matchAll(/\P{M}\p{M}*|\p{M}+/gu)){
  const piece=cluster[0].toLocaleLowerCase('es').normalize('NFD').replace(/\p{M}/gu,mark=>mark==='̃'?mark:'').normalize('NFC');
  for(let i=0;i<piece.length;i++)origin.push(cluster.index);
  normalized+=piece;
 }
 const at=normalized.indexOf(needle);
 if(at<0)return null;
 const lastStart=origin[at+needle.length-1];
 const tail=text.slice(lastStart).match(/^(\P{M}\p{M}*|\p{M}+)/u)?.[0].length??1;
 return {start:origin[at],end:lastStart+tail};
}
