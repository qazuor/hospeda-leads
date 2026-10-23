export function historyPreview<T>(items:T[],expanded:boolean,limit=5){
 return expanded?items:items.slice(0,limit);
}
