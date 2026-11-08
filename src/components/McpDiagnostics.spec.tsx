import {render,screen} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MantineProvider} from '@mantine/core';
import {beforeEach,describe,it,expect,vi} from 'vitest';
import {McpDiagnostics} from './McpDiagnostics';
vi.mock('../endpoints/mcp_diagnostics.schema',()=>({getMcpDiagnostics:vi.fn()}));
import {getMcpDiagnostics} from '../endpoints/mcp_diagnostics.schema';
beforeEach(()=>{Object.defineProperty(window,'matchMedia',{writable:true,value:vi.fn().mockReturnValue({matches:false,media:'',onchange:null,addListener:vi.fn(),removeListener:vi.fn(),addEventListener:vi.fn(),removeEventListener:vi.fn(),dispatchEvent:vi.fn()})});vi.mocked(getMcpDiagnostics).mockResolvedValue({enabled:true,configOk:true,grantsComplete:false,missingTables:['crm_verticals'],excessiveGrants:['users.email'],readerConnection:'grants_incomplete',lastTokenIssuedAt:null,url:'https://crm.example/mcp',clientId:'hospeda-chatgpt',redirectUri:'https://chatgpt.com/connector_platform_oauth_redirect',scopes:['crm.read','offline_access']})});
describe('McpDiagnostics',()=>it('shows missing and excessive grants without secrets',async()=>{render(<MantineProvider><QueryClientProvider client={new QueryClient()}><McpDiagnostics/></QueryClientProvider></MantineProvider>);expect(await screen.findByText(/Faltan: crm_verticals/)).toBeTruthy();expect(screen.getByText(/excessive_grant: users\.email/)).toBeTruthy();expect(screen.getByText('https://crm.example/mcp')).toBeTruthy();expect(screen.queryByText('test-secret-value')).toBeNull()}));
