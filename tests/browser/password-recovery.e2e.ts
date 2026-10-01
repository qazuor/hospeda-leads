import {test,expect} from "@playwright/test";
import superjson from "superjson";
test("forgot password navigation and confirmation",async({page})=>{
 await page.goto("/login");await page.getByRole("link",{name:"Olvidé mi contraseña"}).click();
 await expect(page).toHaveURL(/forgot-password$/);
 await page.route("**/_api/auth/password_recovery/request",route=>route.fulfill({status:200,contentType:"application/json",body:superjson.stringify({message:"Si el email tiene un acceso habilitado, recibirás un enlace."})}));
 await page.getByLabel("Email",{exact:true}).fill("user@example.com");await page.getByRole("button",{name:"Enviar enlace de recuperación"}).click();await expect(page.getByRole("status")).toContainText("recibirás un enlace");
 const token="a".repeat(64);await page.goto(`/reset-password#token=${token}`);
 await expect(page).toHaveURL(/reset-password$/);
 await page.getByLabel("Nueva contraseña",{exact:true}).fill("new-password-123");await page.getByLabel("Repetir contraseña").fill("different-password");await page.getByRole("button",{name:"Guardar contraseña"}).click();await expect(page.getByRole("alert")).toContainText("no coinciden");
 await page.route("**/_api/auth/password_recovery/reset",async route=>{const input=superjson.parse<any>(route.request().postData()!);expect(input.token).toBe(token);await route.fulfill({status:200,contentType:"application/json",body:superjson.stringify({message:"Contraseña actualizada. Ingresá con tu nueva contraseña."})});});
 await page.getByLabel("Repetir contraseña").fill("new-password-123");await page.getByRole("button",{name:"Guardar contraseña"}).click();await expect(page.getByRole("status")).toContainText("Contraseña actualizada");await page.getByRole("link",{name:"Volver al login"}).click();await expect(page).toHaveURL(/login$/);
});
test("reset without token offers a new link",async({page})=>{await page.goto("/reset-password");await expect(page.getByRole("alert")).toContainText("enlace no es válido");await expect(page.getByRole("button",{name:"Guardar contraseña"})).toHaveCount(0);});
