import {test,expect} from "@playwright/test";
for(const path of ["/accounts","/opportunities"]){
 test(`loading feedback preserves rows while filtering ${path}`,async({page})=>{
  await page.addInitScript(()=>localStorage.setItem("hospeda-live-mode","off"));
  await page.goto("/login");await page.getByLabel("Email",{exact:true}).fill("admin@example.com");await page.getByLabel("Password",{exact:true}).fill("test-password-123");await page.getByRole("button",{name:"Log In",exact:true}).click();await expect(page).toHaveURL(/accounts$/);
  await page.goto(path);const busy=page.locator('[aria-busy]');await expect(busy).toHaveAttribute("aria-busy","false");const rows=await page.getByRole("row").count();expect(rows).toBeGreaterThan(1);
  let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);let started!:()=>void;const requested=new Promise<void>(resolve=>started=resolve);
  await page.route("**/_api/leads?**",async route=>{started();await gate;await route.continue();});
  try{await page.getByPlaceholder(path==="/accounts"?"Buscar negocios, oportunidades y notas…":"Buscar en oportunidades y notas…").fill("no-matching-record-for-loading-test");await requested;await expect(page.getByRole("status").filter({hasText:"Actualizando resultados…"})).toBeVisible();await expect(busy).toHaveAttribute("aria-busy","true");expect(await page.getByRole("row").count()).toBe(rows);}
  finally{release();}
  await expect(busy).toHaveAttribute("aria-busy","false");await expect(page.getByText("Actualizando resultados…",{exact:true})).toHaveCount(0);await expect(page.getByRole("row")).toHaveCount(1);
 });
}
