import type {Locator,Page} from '@playwright/test';

/** Picks a result of "¿Qué pasó?" (a group of radio buttons) by its stored value. */
export async function pickOutcome(scope:Page|Locator,value:string):Promise<void>{await scope.locator(`input[name="outcome"][value="${value}"]`).check();}
