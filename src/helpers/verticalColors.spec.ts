import {describe,expect,it} from 'vitest';
import {fallbackHues,knownVerticalTones,verticalKey,verticalTone} from './verticalColors';

const hslToRgb=(h:number,s:number,l:number)=>{s/=100;l/=100;const k=(n:number)=>(n+h/30)%12,a=s*Math.min(l,1-l),f=(n:number)=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));return [f(0),f(8),f(4)].map(v=>v*255);};
const luminance=(rgb:number[])=>{const [r,g,b]=rgb.map(v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4;});return 0.2126*r+0.7152*g+0.0722*b;};
const contrast=(a:number[],b:number[])=>{const [x,y]=[luminance(a),luminance(b)].sort((m,n)=>n-m);return (x+0.05)/(y+0.05);};
// Mirrors valueBadgeColors + ValueBadge.module.css: tint = hsl(h max(45,s)% 52%) mixed 15% into --card; text = hsl(h min(85,s+10)% 24% light | 82% dark).
const ratio=(tone:readonly [number,number],dark:boolean)=>{
  const [h,sat]=tone,tint=hslToRgb(h,Math.max(45,sat),52),card=dark?hslToRgb(220,15,15):[255,255,255];
  const background=tint.map((v,i)=>v*0.15+card[i]*0.85);
  return contrast(hslToRgb(h,Math.min(85,sat+10),dark?82:24),background);
};

describe('verticalTone',()=>{
 it('maps every known rubro explicitly and singular/plural spellings share a colour',()=>{
  for(const name of ['Alojamiento','Gastronomía','Experiencia','Actividades','Turismo rural','Partner','Proveedor de servicios','Editor'])expect(knownVerticalTones.has(name.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase()),name).toBe(true);
  expect(verticalTone('Alojamientos')).toEqual(verticalTone('Alojamiento'));
  expect(verticalTone('  GASTRONOMIA ')).toEqual(verticalTone('Gastronomía'));
  expect(verticalTone('Proveedores de servicios')).toEqual(verticalTone('Proveedor de servicios'));
 });
 it('gives the main rubros different hues',()=>{
  const hues=['Alojamiento','Gastronomía','Experiencia','Turismo rural','Partner','Proveedor de servicios','Editor'].map(name=>verticalTone(name)[0]);
  expect(new Set(hues).size).toBe(hues.length);
 });
 it('is deterministic for unknown values and never throws on prototype names',()=>{
  expect(verticalTone('Rubro nuevo')).toEqual(verticalTone('Rubro nuevo'));
  expect(verticalTone('rubro NUEVO ')).toEqual(verticalTone('Rubro nuevo'));
  expect(verticalTone('Rubro nuevo')).toEqual([expect.any(Number),55]);
  for(const value of ['constructor','__proto__','toString'])expect(verticalTone(value)).toEqual([expect.any(Number),55]);
 });
 it('keeps ñ distinct from n while folding accents and case',()=>{
  expect(verticalTone('Cabaña')).toEqual(verticalTone('cabaña'));
  expect(verticalTone('Gastronomía')).toEqual(verticalTone('gastronomia'));
  expect(verticalKey('Cabaña')).not.toBe(verticalKey('Cabana'));
  expect(verticalKey('Cabaña')).toBe(verticalKey('CABAÑA'));
  expect(verticalKey('Gastronomía')).toBe('gastronomia');
 });
 it('keeps reserve hues away from known rubros and the danger red',()=>{
  const dist=(a:number,b:number)=>Math.min(Math.abs(a-b),360-Math.abs(a-b));
  for(const h of fallbackHues){
   for(const [known] of knownVerticalTones.values())expect(dist(h,known),`${h} vs ${known}`).toBeGreaterThanOrEqual(25);
   expect(dist(h,0)).toBeGreaterThan(15);
  }
 });
 it('keeps badge text at WCAG AA (4.5:1) in light and dark for known and fallback hues',()=>{
  const tones=[...knownVerticalTones.values(),...fallbackHues.map(h=>[h,55] as const)];
  for(const tone of tones)for(const dark of [false,true])expect(ratio(tone,dark),`hue ${tone[0]} ${dark?'dark':'light'}`).toBeGreaterThanOrEqual(4.5);
 });
});
