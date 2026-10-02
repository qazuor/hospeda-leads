import {test,expect} from "@playwright/test";
test("free search is an AND filter shared by toolbar, dialog and legend",async({page})=>{
 await page.addInitScript(()=>localStorage.setItem("hospeda-live-mode","off"));
 await page.goto("/login");await page.getByLabel("Email",{exact:true}).fill("admin@example.com");await page.getByLabel("Contraseña",{exact:true}).fill("test-password-123");await page.getByRole("button",{name:"Ingresar",exact:true}).click();await expect(page).toHaveURL(/my-day$/);await page.goto("/accounts");
 const search=page.getByPlaceholder("Buscar negocios, oportunidades y notas…");await search.fill("CRM test");await page.getByRole("button",{name:/^Filtrar/}).click();
 const dialog=page.getByRole("dialog",{name:"Filtrar negocios"});const free=dialog.getByLabel("Texto libre de búsqueda");await expect(free).toHaveValue("CRM test");await free.fill("cancelled change");await dialog.getByRole("button",{name:"Cancelar",exact:true}).click();await expect(search).toHaveValue("CRM test");
 await page.getByRole("button",{name:/^Filtrar/}).click();await expect(free).toHaveValue("CRM test");await free.fill("Segunda venta");await dialog.getByRole("button",{name:"Agregar filtro AND"}).click();await dialog.locator("select").first().selectOption("ciudad");await dialog.locator("select").nth(2).selectOption("Concepción del Uruguay");await dialog.getByRole("button",{name:"Aplicar filtros"}).click();
 await expect(search).toHaveValue("Segunda venta");await expect(page.getByText("Texto libre contiene «Segunda venta»",{exact:true})).toBeVisible();await expect(page.getByText("AND",{exact:true})).toBeVisible();
 await page.getByRole("button",{name:/^Filtrar/}).click();await dialog.getByRole("button",{name:"Quitar búsqueda"}).click();await dialog.getByRole("button",{name:"Aplicar filtros"}).click();await expect(search).toHaveValue("");await expect(page.getByText("Ciudad es Concepción del Uruguay",{exact:true})).toBeVisible();
 await search.fill("CRM test");await page.getByRole("button",{name:"Limpiar",exact:true}).click();await expect(search).toHaveValue("");await expect(page.getByText("Ciudad es Concepción del Uruguay",{exact:true})).toHaveCount(0);
});
