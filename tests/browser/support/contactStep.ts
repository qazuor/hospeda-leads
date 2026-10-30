import {expect,type Locator} from '@playwright/test';

/**
 * Owner review of spec 96: the contact step shows one «Para: …» line whose «Cambiar» expands the channel, «Sobre», purpose and person controls.
 * They start collapsed when everything is resolved and expanded when a choice is required, and stay open once expanded. Expands them when
 * they are collapsed, then waits for `target` to be visible.
 */
export async function reveal(scope:Locator,target:Locator):Promise<void>{
 // Decide only once the destination is resolved: while the step loads the controls show and then collapse.
 const region=scope.getByRole('region',{name:'Destino del mensaje',exact:true});
 await expect(region).toBeVisible();await expect(region).not.toContainText('Cargando');
 const more=region.getByRole('button',{name:'Cambiar',exact:true,expanded:false});
 await expect(more.or(target)).toBeVisible();
 if(await more.isVisible())await more.click();
 await expect(target).toBeVisible();
}
