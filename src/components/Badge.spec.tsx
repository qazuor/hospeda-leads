import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {MantineProvider} from '@mantine/core';
import {Badge} from './Badge';

describe('Badge',()=>{
 it.each(['primary','destructive','success','warning','secondary','outline'] as const)('gives the %s variant a readable tone class instead of a forced colour',variant=>{
  const html=renderToStaticMarkup(<MantineProvider><Badge variant={variant}>Texto</Badge></MantineProvider>);
  expect(html).toMatch(/class="[^"]*tone/);
  expect(html).not.toMatch(/<span[^>]* style="[^"]*color:/);
 });
});
