import {describe,it,expect} from 'vitest';
import {classifyToolError,safePath,safeReceivedOrigin,safeReceivedHost,toolError} from './safe';
describe('MCP safe diagnostics',()=>{
 it('removes query strings from logged paths',()=>expect(safePath('/mcp/oauth/token?code=secret')).toBe('/mcp/oauth/token'));
 it('logs only origin/host authorities',()=>{expect(safeReceivedOrigin('https://evil.example/path?token=secret')).toBe('https://evil.example');expect(safeReceivedHost('user@example.com?secret')).toBe('example.com')});
 it('classifies bounded tool errors',()=>{expect(classifyToolError({code:'MCP_READER_GRANTS_INCOMPLETE'})).toBe('grant_missing');expect(classifyToolError({code:'57014'})).toBe('timeout');expect(classifyToolError(new Error('x'))).toBe('internal_error')});
 it('returns code-specific safe remediation',()=>{expect(toolError('grant_missing')).toBe('Falta configurar el acceso de lectura del CRM. Avisá al administrador (código grant_missing).');expect(toolError('reader_unsafe')).toContain('Falta configurar el acceso');expect(toolError('permission_denied')).toContain('Falta configurar el acceso');expect(toolError('timeout')).toContain('probá con un filtro más chico');expect(toolError('not_found')).toContain('No se encontró');expect(toolError('invalid_input')).toContain('no son válidos');expect(toolError('internal_error')).toContain('Probá de nuevo más tarde');expect(toolError('internal_error').toLowerCase()).not.toContain('vincular');});
 it('caps remediation text at 200 characters and escapes newlines',()=>{const text=toolError('internal_error');expect(text.length).toBeLessThanOrEqual(200);expect(text).not.toMatch(/[\r\n]/);});
});
