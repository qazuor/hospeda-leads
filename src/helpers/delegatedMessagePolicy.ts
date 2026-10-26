export function canPrepareDelegatedMessage(input:{taskPending:boolean;taskAssigneeEmail:string|null;managementOwnerEmail:string|null;userEmail:string|null;admin:boolean;doNotContact:boolean}){
 return input.taskPending&&!input.admin&&!input.doNotContact&&!!input.userEmail&&input.taskAssigneeEmail===input.userEmail&&input.managementOwnerEmail!==input.userEmail;
}
