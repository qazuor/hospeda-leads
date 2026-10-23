export function splitEmptyFields<T extends string>(fields:readonly T[],getValue:(field:T)=>unknown){
 const populated:T[]=[],empty:T[]=[];
 for(const field of fields){const value=getValue(field);(value==null||value===''||Array.isArray(value)&&!value.length?empty:populated).push(field)}
 return {populated,empty};
}
