import {test,expect} from "@playwright/test";
for(const path of ["/accounts","/opportunities"]){
 test(`loading feedback preserves rows while filtering ${path}`,async({page})=>{
  await page.addInitScript(()=>localStorage.setItem("hospeda-live-mode","off"));
  await page.goto("/login");await page.getByLabel("Email",{exact:true}).fill("admin@example.com");await page.getByLabel("Contraseña",{exact:true}).fill("test-password-123");await page.getByRole("button",{name:"Ingresar",exact:true}).click();await expect(page).toHaveURL(/my-day$/);await page.goto("/accounts");
  await page.goto(path);if(path==="/opportunities")await page.getByRole("button",{name:"Tabla",exact:true}).click();const busy=page.locator('[aria-busy]');await expect(busy).toHaveAttribute("aria-busy","false");const rows=await page.getByRole("row").count();expect(rows).toBeGreaterThan(1);
  let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);let started!:()=>void;const requested=new Promise<void>(resolve=>started=resolve);
  await page.route("**/_api/leads?**",async route=>{started();await gate;await route.continue();});
  try{await (path==="/accounts"?page.getByRole("textbox",{name:"Buscar negocios",exact:true}):page.getByPlaceholder("Buscar en gestiones y notas…")).fill("no-matching-record-for-loading-test");await requested;await expect(page.getByRole("status").filter({hasText:path==="/accounts"?"Cargando negocios…":"Actualizando resultados…"})).toBeVisible();await expect(busy).toHaveAttribute("aria-busy","true");if(path==="/accounts")await expect(page.locator("tbody [data-business-id]")).toHaveCount(0);else expect(await page.getByRole("row").count()).toBe(rows);}
  finally{release();}
  await expect(busy).toHaveAttribute("aria-busy","false");await expect(page.getByText("Actualizando resultados…",{exact:true})).toHaveCount(0);await expect(page.getByRole("row")).toHaveCount(1);
 });
}
