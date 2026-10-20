import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {ManualAttemptResolution} from './ManualAttemptResolution';

describe('ManualAttemptResolution',()=>{
 it('offers the three manual results with their stored values and plain labels',()=>{
  const html=renderToStaticMarkup(<MantineProvider><QueryClientProvider client={new QueryClient()}><ManualAttemptResolution message={{id:'m1'} as never}/></QueryClientProvider></MantineProvider>);
  const options=[...html.matchAll(/<option value="([^"]+)"[^>]*>([^<]+)<\/option>/g)].map(m=>[m[1],m[2]]);
  expect(options).toEqual([['manual_sent','Lo hice (confirmo que se envió)'],['manual_no_contact','Lo intenté pero no respondió o no lo pude contactar'],['manual_not_done','No lo hice']]);
 });
});
