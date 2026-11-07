import {apiJson} from '../helpers/apiClient';
export type McpDiagnostics={enabled:boolean;configOk:boolean;configProblem?:string;grantsComplete:boolean;missingTables:string[];readerConnection:'ok'|'unreachable'|'unsafe_role'|'grants_incomplete';lastTokenIssuedAt:string|null;url:string;clientId:string|null;redirectUri:string;scopes:string[]};
export const getMcpDiagnostics=()=>apiJson<McpDiagnostics>('/_api/mcp/diagnostics');
