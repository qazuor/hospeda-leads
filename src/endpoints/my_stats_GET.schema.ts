import {z} from 'zod';
import {apiJson} from '../helpers/apiClient';

/** Calendar day in Argentina, serialized as YYYY-MM-DD. */
export const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Strict query contract for the seller's private statistics. `user` (a user id) is admin-only: it shows that user's numbers. */
export const schema=z.object({from:day,to:day,user:z.string().regex(/^[1-9]\d{0,9}$/).refine(value=>Number(value)<=2147483647).optional()}).strict();
export type MyStatsInput=z.infer<typeof schema>;
export type OutputType={period:{from:string;to:string};asOf:string;work:{completed:number;overdue:number;today:number};businesses:{total:number;doNotContact:number;byStatus:{status:string;count:number}[]};managements:{open:number;won:number;lost:number;closeRate:number|null;lossReasons:{reason:string;count:number}[];stale:number};contacts:{events:number;businesses:number;firstContactAverageDays:number|null;firstContactSamples:number};series:{granularity:'day'|'week';points:{period:string;contacts:number;won:number}[]}};
/** Fetches the authenticated user's statistics, or, for an admin passing `user`, that user's statistics. */
export const getMyStats=(input:MyStatsInput):Promise<OutputType>=>apiJson<OutputType>('/_api/my_stats?'+new URLSearchParams(Object.entries(input).filter((entry):entry is [string,string]=>entry[1]!==undefined)).toString());
