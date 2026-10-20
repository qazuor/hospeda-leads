import {afterEach,describe,expect,it,vi} from 'vitest';
import {isChunkLoadError,reloadOnceForStaleChunk} from './chunkReload';

afterEach(()=>{window.sessionStorage.clear();vi.restoreAllMocks();});

describe('isChunkLoadError',()=>{
  it.each(['Failed to fetch dynamically imported module: /assets/a.js','Importing a module script failed.','error loading dynamically imported module'])('matches %s',message=>expect(isChunkLoadError(new TypeError(message))).toBe(true));
  it('matches ChunkLoadError by name',()=>{const e=new Error('x');e.name='ChunkLoadError';expect(isChunkLoadError(e)).toBe(true);});
  it('ignores other errors',()=>{expect(isChunkLoadError(new Error('boom'))).toBe(false);expect(isChunkLoadError(null)).toBe(false);});
});

describe('reloadOnceForStaleChunk',()=>{
  it('reloads the first time and not again within 30 s',()=>{
    const reload=vi.fn();
    expect(reloadOnceForStaleChunk({now:1_000,reload})).toBe(true);
    expect(reloadOnceForStaleChunk({now:20_000,reload})).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it('reloads again after 30 s',()=>{
    const reload=vi.fn();
    reloadOnceForStaleChunk({now:1_000,reload});
    expect(reloadOnceForStaleChunk({now:31_001,reload})).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });
  it('does not reload (no loop risk) when storage throws',()=>{
    vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('denied');});
    const reload=vi.fn();
    expect(reloadOnceForStaleChunk({now:1_000,reload})).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
