import { test, expect } from "@playwright/test";
test("Flujo completo de catálogo, almacén, venta, reportes y permisos", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("Usuario: admin", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Contraseña: admin123", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Proyecto académico · SENATI")).toHaveCount(0);
  await page.getByLabel("Usuario", { exact: true }).fill("admin");
  await page.getByLabel("Contraseña", { exact: true }).fill("admin123");
  await page.getByRole("button", { name: "Ingresar al sistema" }).click();
  await expect(
    page.getByRole("heading", { name: "Panel principal", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Panel principal", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Medicamentos", exact: true }).click();
  await page
    .getByRole("button", { name: "Nuevo medicamento", exact: true })
    .click();
  const name = "Prueba navegador " + Date.now();
  const modal = page.getByRole("dialog");
  await modal.getByLabel("Nombre del medicamento").fill(name);
  await modal.getByLabel("Categoría").fill("Pruebas");
  await modal.getByLabel("Presentación").fill("Tableta");
  await modal.getByLabel("Precio unitario").fill("2.50");
  await modal.getByLabel("Stock mínimo").fill("5");
  await modal.getByRole("button", { name: "Guardar medicamento" }).click();
  await expect(modal).toBeHidden();
  await page.getByPlaceholder("Buscar medicamento o categoría…").fill(name);
  await expect(
    page.getByRole("cell", { name, exact: false }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await modal.getByLabel("Precio unitario").fill("3.00");
  await modal.getByRole("button", { name: "Guardar medicamento" }).click();
  await expect(modal).toBeHidden();
  await expect(
    page.getByRole("cell", { name: "S/ 3.00", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Almacén", exact: true }).click();
  await page
    .getByRole("button", { name: "Registrar movimiento", exact: true })
    .click();
  await modal
    .getByRole("combobox", { name: "Medicamento", exact: true })
    .selectOption({ label: name });
  await modal.getByLabel("Código del lote").fill("UI-" + Date.now());
  await modal.getByLabel("Vencimiento").fill("2028-12-31");
  await modal.getByLabel("Cantidad de unidades").fill("12");
  await modal.getByLabel("Motivo o referencia").fill("Prueba del navegador");
  await modal
    .getByRole("button", { name: "Registrar movimiento", exact: true })
    .click();
  await expect(modal).toBeHidden();
  await page.getByRole("button", { name: "Ventas", exact: true }).click();
  await page.getByRole("button", { name: "Nueva venta", exact: true }).click();
  await modal
    .getByLabel("Cliente", { exact: true })
    .fill("Cliente de prueba navegador");
  const option = await modal
    .getByLabel("Agregar medicamento")
    .locator("option")
    .filter({ hasText: name })
    .getAttribute("value");
  await modal.getByLabel("Agregar medicamento").selectOption(option);
  await modal.getByLabel("Cantidad de " + name, { exact: true }).fill("2");
  await expect(modal.locator(".sale-total")).toContainText("S/ 6.00");
  await modal.getByRole("button", { name: "Confirmar venta" }).click();
  await expect(modal).toBeHidden();
  await page
    .getByRole("row")
    .filter({ hasText: "Cliente de prueba navegador" })
    .first()
    .getByRole("button", { name: "Ver detalle" })
    .click();
  await expect(
    modal.getByRole("heading", { name: "Detalle de venta" }),
  ).toBeVisible();
  await expect(modal.locator(".sale-total")).toContainText("S/ 6.00");
  await modal.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.getByRole("button", { name: "Medicamentos", exact: true }).click();
  await page.getByPlaceholder("Buscar medicamento o categoría…").fill(name);
  await expect(page.getByRole("row").filter({ hasText: name })).toContainText(
    "10 / 10",
  );
  for (const section of ["Movimientos", "Alertas", "Reportes", "Usuarios"]) {
    await page.getByRole("button", { name: section, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: section, exact: true }),
    ).toBeVisible();
    await expect(page.locator(".loading")).toHaveCount(0);
  }
  await page
    .getByRole("button", { name: "Panel principal", exact: true })
    .click();
  await expect(page.locator(".chart")).toBeVisible();
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.screenshot({ path: "test-results/dashboard.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Abrir menú" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page.getByLabel("Usuario", { exact: true })).toBeVisible();
  await page.reload();
  await page
    .getByLabel("Usuario", { exact: true })
    .fill("trabajador@farmaplus.pe");
  await page.getByLabel("Contraseña", { exact: true }).fill("FarmaPlus2026!");
  await page.getByRole("button", { name: "Ingresar al sistema" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Usuario o contraseña incorrectos.",
  );
  expect(errors).toEqual([]);
});
