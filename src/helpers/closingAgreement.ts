export function closeMarksClient(input:{managementType:string|null;stage:string;outcomeKey:string|null;convertClient:boolean}){
 if(input.managementType==='main'||input.managementType==='partner')return input.stage.endsWith(':won');
 if(input.managementType==='editor')return input.outcomeKey==='proposal_won'&&input.convertClient;
 return !input.managementType&&input.convertClient;
}

export function validClosingAgreement(value:{agreement:string;person:string}){
 return value.agreement.trim().length>=3&&value.person.trim().length>=3;
}
