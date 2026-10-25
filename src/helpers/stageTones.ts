import {managementStageCatalog,managementTypes,type ManagementType} from './businessManagement';

/** Design token names used to distinguish pipeline stages. */
export type ToneName='blue'|'green'|'orange'|'red'|'violet'|'sky'|'pink'|'slate';
/** Pipeline stage shape needed to assign a visual tone. */
export interface StageToneEntry{readonly name:string;readonly classification:'open'|'won'|'lost';readonly managementType:ManagementType|null}
const palette:readonly ToneName[]=['slate','sky','violet','orange','pink','blue'];
/** Returns a stable tone based on outcome and position among open stages for that management type. */
export function stageTone({stage,stages}:{stage:StageToneEntry|null;stages:readonly StageToneEntry[]}):ToneName{
 if(!stage)return 'slate';if(stage.classification==='won')return 'green';if(stage.classification==='lost')return 'red';
 const prefix=stage.name.split(':')[0];const type=stage.managementType??(managementTypes.includes(prefix as ManagementType)?prefix as ManagementType:null);if(!type)return 'slate';const provided=stages.filter(item=>item.managementType===type&&item.classification==='open');
 const ordered=provided.length?provided:managementStageCatalog(type).filter(item=>item.classification==='open').map(item=>({name:item.key,classification:item.classification,managementType:type}));
 const index=ordered.findIndex(item=>item.name===stage.name);return index<0?'slate':palette[index%palette.length];
}
