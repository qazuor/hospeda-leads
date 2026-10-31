import {expect,type Locator,type Page} from '@playwright/test';

/**
 * Spec 100 §5: «Requiere acción» is one collapsed line on mount («N pendientes · Revisar», or «Sin pendientes · …» with «Ver» when only
 * uncounted entries are listed). This waits for the strip inside `scope`, expands it when it is collapsed and returns the region, so
 * the caller can look into its entries. A strip that is already open (e.g. `?pending=open`) is left as is.
 */
export async function openRequiresAction(scope:Page|Locator):Promise<Locator>{
 const region=scope.getByRole('region',{name:'Requiere acción',exact:true}),toggle=region.getByRole('button',{name:/^(Revisar|Ver)$/}),hide=region.getByRole('button',{name:'Ocultar',exact:true});
 await expect(toggle.or(hide)).toBeVisible();
 // Stacked toasts (bottom right) can cover the toggle; only when a click is intercepted are they closed, so callers can still assert on them.
 if(await toggle.isVisible())await toggle.click({timeout:5000}).catch(async()=>{const page=(scope as Locator).page?.()??(scope as Page),close=page.locator('[data-sonner-toast] [data-close-button]');for(let i=await close.count();i>0;i--)await close.first().click().catch(()=>{});await toggle.click();});
 await expect(hide).toBeVisible();
 return region;
}
