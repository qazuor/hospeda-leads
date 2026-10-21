import type {Page} from '@playwright/test';

/**
 * Waits until no CSS transition is running. Mantine's Accordion/Collapse clips its panel (`overflow:hidden`)
 * while it grows, so Playwright scrolling a target inside it slides the content under the pointer between
 * mousedown and mouseup and the click is lost. Call it right after opening a Disclosure and before interacting with its content.
 */
export async function waitForTransitions(page:Page):Promise<void>{
  await page.waitForFunction(()=>!document.getAnimations().some(a=>a instanceof CSSTransition&&a.playState==='running'));
}
