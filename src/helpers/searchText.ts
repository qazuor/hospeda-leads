/** Search equivalence only: keep stored text and the distinct Spanish letter ñ. */
export function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase('es').normalize('NFD')
    .replace(/\p{M}/gu, mark => mark === '\u0303' ? mark : '')
    .normalize('NFC');
}

/** Returns a lower score for closer matches, or null when the text does not match. */
export function fuzzySearchScore(query: string, text: string): number | null {
  const normalizedQuery=normalizeSearchText(query);
  const normalizedText=normalizeSearchText(text);
  if(!normalizedQuery||!normalizedText)return null;
  if(normalizedText.includes(normalizedQuery))return 0;
  const tokens=normalizedQuery.split(/\s+/u).filter(Boolean);
  const words=normalizedText.match(/[\p{L}\p{N}@._-]+/gu)??[];
  let score=0;
  for(const token of tokens){
    if(normalizedText.includes(token)){score+=0.01;continue;}
    const tolerance=token.length>=7?2:token.length>=4?1:0;
    if(!tolerance)return null;
    let best=tolerance+1;
    for(const word of words){
      if(Math.abs(word.length-token.length)>tolerance)continue;
      if(token!==word&&token.replaceAll('ñ','n')===word.replaceAll('ñ','n'))continue;
      let previous=Array.from({length:word.length+1},(_,index)=>index);
      for(let i=1;i<=token.length;i++){
        const current=[i];
        for(let j=1;j<=word.length;j++)current[j]=Math.min(current[j-1]+1,previous[j]+1,previous[j-1]+(token[i-1]===word[j-1]?0:1));
        previous=current;
      }
      best=Math.min(best,previous[word.length]);
      if(best===0)break;
    }
    if(best>tolerance)return null;
    score+=best/token.length;
  }
  return score;
}
