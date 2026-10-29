import { test, expect } from "@playwright/test";

if (process.env.FORMA_TEST_DISPOSABLE !== "1" || !process.env.PAGES_TEST_URL) throw new Error("Use apenas um servidor e banco descartáveis: defina FORMA_TEST_DISPOSABLE=1 e PAGES_TEST_URL.");

test("modo servidor mantém rascunho offline, não enfileira sessão e permite corrigir após reconectar", async ({ page, context }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByText("Tudo salvo. Tudo seu.")).toBeVisible();
  await page.getByRole("button", { name: "Registrar treino", exact: true }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Registrar treino livre" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome da sessão").fill("Servidor offline teste");
  await dialog.getByLabel("Buscar exercício para a sessão").fill("Supino reto com barra");
  await dialog.getByRole("button", { name: /Supino reto com barra/ }).click();
  await dialog.getByLabel("Carga da série 1 de Supino reto com barra").fill("40");
  await dialog.getByRole("button", { name: "Concluir série 1 de Supino reto com barra" }).click();
  await context.setOffline(true);
  await dialog.getByRole("button", { name: "Finalizar e salvar" }).click();
  await expect(page.locator(".toast.error-toast")).toContainText("não entrou na fila offline");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("forma-offline-queue") ?? "[]"))).toEqual([]);
  await page.locator(".toast.error-toast").getByRole("button", { name: "Fechar aviso" }).click();
  await dialog.getByRole("button", { name: "Guardar rascunho" }).click();
  await context.setOffline(false);
  await page.getByRole("link", { name: "Diário de treino", exact: true }).click();
  await expect(page.getByRole("button", { name: "Ver registro de Servidor offline teste" })).toHaveCount(0);
  await page.getByRole("region", { name: "Rascunho de treino" }).getByRole("button", { name: "Continuar treino" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Finalizar e salvar" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Ver registro de Servidor offline teste" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Editar registro" }).click();
  dialog = page.getByRole("dialog", { name: "Corrigir registro" });
  await dialog.getByLabel("Carga da série 1 de Supino reto com barra").fill("45");
  await dialog.getByRole("button", { name: "Salvar correções" }).click();
  await expect(dialog).toHaveCount(0);
  const result = await page.evaluate(async () => (await (await fetch("/api/app")).json()).data);
  const logs = result.logs.filter((log: { name: string }) => log.name === "Servidor offline teste");
  expect(logs).toHaveLength(1);
  expect(logs[0].entries[0].sets[0].weight).toBe(45);
});
