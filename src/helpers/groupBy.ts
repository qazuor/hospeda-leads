/** Groups items by key, preserving the input order inside each group. */
export function groupBy<T,K>(items:readonly T[],key:(item:T)=>K):Map<K,T[]>{
  const groups=new Map<K,T[]>();
  for(const item of items){const k=key(item);const group=groups.get(k);if(group)group.push(item);else groups.set(k,[item]);}
  return groups;
}

/** Counts items per key. */
export function countBy<T,K>(items:readonly T[],key:(item:T)=>K):Map<K,number>{
  const counts=new Map<K,number>();
  for(const item of items){const k=key(item);counts.set(k,(counts.get(k)??0)+1);}
  return counts;
}
