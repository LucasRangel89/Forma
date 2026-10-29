import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { AppData } from "../src/lib/types";

async function openApp(page: Page) {
  await page.goto("./", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Seu treino, em equilíbrio." })).toBeVisible();
}
async function openView(page: Page, name: string) {
  await page.getByRole("link", { name, exact: name !== "Assistente" }).click();
}
async function readData(page: Page): Promise<AppData> {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("forma-pages", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const get = db.transaction("profile", "readonly").objectStore("profile").get("main");
      get.onsuccess = () => { resolve(get.result.data); db.close(); };
      get.onerror = () => reject(get.error);
    };
  }));
}
async function audit(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(result.violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`)).toEqual([]);
}

test("a página estática carrega recursos no subdiretório e identifica os exemplos", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await openApp(page);
  await expect(page.getByText("Salvo neste navegador")).toBeVisible();
  await expect(page.getByText("Você está explorando com dados de exemplo.")).toBeVisible();
  await expect(page.locator(".workout-photo")).toHaveAttribute("src", /\/Forma\/images\/training\.jpg/);
  expect(await page.locator(".workout-photo").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBeTruthy();
  expect(errors).toEqual([]);
});

test("preferências são salvas no navegador mesmo sem conexão e sobrevivem à recarga", async ({ page, context }) => {
  await openApp(page);
  await openView(page, "Configurações");
  await context.setOffline(true);
  await page.getByLabel("Como podemos chamar você?").fill("Perfil de teste");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByRole("status")).toContainText("Preferências salvas");
  await context.setOffline(false);
  await page.reload();
  await openView(page, "Configurações");
  await expect(page.getByLabel("Como podemos chamar você?")).toHaveValue("Perfil de teste");
  await page.getByRole("button", { name: "Noite · vermelho (herança do Diário)" }).click();
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("noite");
  await page.reload();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("noite");
});

test("registro valida séries, permite RIR vazio e persiste no diário", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Registrar treino", exact: true }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /Upper A/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Repetições da série 1 de Supino reto com barra").fill("0");
  await dialog.getByLabel("RIR da série 1 de Supino reto com barra, opcional").fill("");
  await dialog.getByRole("button", { name: "Concluir série 1 de Supino reto com barra" }).click();
  await dialog.getByRole("button", { name: "Finalizar e salvar" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Confira carga");
  await dialog.getByLabel("Repetições da série 1 de Supino reto com barra").fill("8");
  await dialog.getByRole("button", { name: "Finalizar e salvar" }).click();
  await expect(dialog).toHaveCount(0);
  let data = await readData(page);
  expect(data.logs.filter(log => !log.demo)).toHaveLength(1);
  expect(data.logs.find(log => !log.demo)?.entries[0].sets[0]).toMatchObject({ reps: 8, rir: null, completed: true });
  await page.reload();
  data = await readData(page);
  expect(data.logs.filter(log => !log.demo)).toHaveLength(1);
  await openView(page, "Diário de treino");
  await expect(page.locator(".recent-table tbody tr").first()).toContainText("Upper A");
});

test("importação valida arquivo e não duplica sessões já importadas", async ({ page }) => {
  await openApp(page);
  await openView(page, "Diário de treino");
  const session = { date: "2026-10-12", name: "Movimento único do Diário", group: "Pernas", weight: 40, reps: [10, 10] };
  const file = { name: "diario.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ sessions: [session, session] })) };
  await page.getByRole("button", { name: "Importar do Diário" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Selecionar arquivo do Diário").setInputFiles({ name: "invalido.json", mimeType: "application/json", buffer: Buffer.from('{"sessions":[{"date":"quebrado"}]}') });
  await expect(dialog.getByRole("alert")).toContainText("Nenhum dado foi importado");
  await expect(dialog.getByRole("button", { name: /Importar.*sessões/ })).toBeDisabled();
  await dialog.getByLabel("Selecionar arquivo do Diário").setInputFiles(file);
  await dialog.getByRole("button", { name: /Importar 2 sessões/ }).click();
  await expect(dialog.getByRole("heading", { name: "Importação concluída" })).toBeVisible();
  await dialog.getByRole("button", { name: "Concluir", exact: true }).click();
  expect((await readData(page)).logs.filter(log => log.id.startsWith("diario-"))).toHaveLength(2);
  await page.getByRole("button", { name: "Importar do Diário" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Selecionar arquivo do Diário").setInputFiles(file);
  await dialog.getByRole("button", { name: /Importar 2 sessões/ }).click();
  await expect(dialog.getByRole("heading", { name: "Importação concluída" })).toBeVisible();
  expect((await readData(page)).logs.filter(log => log.id.startsWith("diario-"))).toHaveLength(2);
});

test("importação de plano é atômica quando o arquivo é inválido", async ({ page }) => {
  await openApp(page);
  const initial = await readData(page);
  const exercise = { ...initial.exercises[0], id: "teste-importacao-atomica", name: "Exercício especial de teste" };
  const prescription = { ...initial.plans[0].exercises[0], exerciseId: exercise.id, repsMin: 20, repsMax: 5 };
  const plan = { ...initial.plans[0], name: "Treino importado de teste", exercises: [prescription] };
  await openView(page, "Meus treinos");
  const input = page.getByLabel("Selecionar arquivo de treino");
  await input.setInputFiles({ name: "plano.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ plan, exercises: [exercise] })) });
  await expect(page.locator(".toast[role=alert]")).toContainText("A faixa de repetições está invertida");
  expect((await readData(page)).exercises.some(item => item.id === exercise.id)).toBe(false);
  prescription.repsMin = 5;
  prescription.repsMax = 20;
  await input.setInputFiles({ name: "plano.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ plan, exercises: [exercise] })) });
  await expect(page.getByRole("status")).toContainText("Treino importado");
  const after = await readData(page);
  expect(after.plans.some(item => item.name === plan.name)).toBe(true);
  expect(after.exercises.some(item => item.id === exercise.id)).toBe(true);
});

test("backup completo pode ser restaurado e arquivo inválido não substitui dados", async ({ page }) => {
  await openApp(page);
  await openView(page, "Configurações");
  await page.getByRole("button", { name: "Meus dados" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar meus dados" }).click();
  const download = await downloadPromise;
  const file = await readFile(await download.path());
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Remover exemplos" }).click();
  await expect(page.getByRole("button", { name: "Remover exemplos" })).toBeDisabled();
  expect((await readData(page)).logs).toHaveLength(0);
  const input = page.getByLabel("Selecionar backup do Forma");
  await input.setInputFiles({ name: "quebrado.json", mimeType: "application/json", buffer: Buffer.from("{}") });
  await expect(page.locator(".form-error[role=alert]")).toContainText("Nenhum dado foi alterado");
  expect((await readData(page)).logs).toHaveLength(0);
  page.once("dialog", dialog => dialog.accept());
  await input.setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: file });
  await expect(page.getByRole("status")).toContainText("Backup restaurado");
  expect((await readData(page)).logs).toHaveLength(12);
});

test("editores protegem alterações e o foco fica no diálogo", async ({ page }) => {
  await openApp(page);
  await openView(page, "Meus treinos");
  const trigger = page.getByRole("button", { name: "Novo treino" });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome do treino").fill("Meu rascunho");
  await page.keyboard.press("Control+k");
  await expect(dialog.getByLabel("Nome do treino")).toBeFocused();
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')))).toBe(true);
  page.once("dialog", dialogEvent => dialogEvent.dismiss());
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Nome do treino")).toHaveValue("Meu rascunho");
  page.once("dialog", dialogEvent => dialogEvent.accept());
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("preferências não salvas exigem confirmação antes de sair", async ({ page }) => {
  await openApp(page);
  await openView(page, "Configurações");
  await page.getByLabel("Como podemos chamar você?").fill("Rascunho");
  page.once("dialog", dialog => dialog.dismiss());
  await openView(page, "Meus treinos");
  await expect(page.getByLabel("Como podemos chamar você?")).toHaveValue("Rascunho");
  page.once("dialog", dialog => dialog.accept());
  await openView(page, "Meus treinos");
  await expect(page.getByRole("heading", { name: "Seus treinos. Suas escolhas." })).toBeVisible();
});

test("navegação móvel funciona por teclado e não há rolagem horizontal inesperada", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 320, height: 800 });
  await openApp(page);
  const trigger = page.getByRole("button", { name: "Abrir navegação" });
  await trigger.click();
  await expect(page.locator(".sidebar.is-open")).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest(".sidebar")))).toBe(true);
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator(".brand")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest(".sidebar")))).toBe(true);
  await page.keyboard.press("Tab");
  await expect(page.locator(".brand")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  for (const name of ["Meus treinos", "Exercícios", "Diário de treino", "Evolução", "Assistente", "Configurações"]) {
    await trigger.click();
    await openView(page, name);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), name).toBe(true);
  }
});

test("atalho e busca do cabeçalho levam o foco à busca de exercícios", async ({ page }) => {
  await openApp(page);
  await page.keyboard.press("Control+k");
  await expect(page.getByLabel("Buscar exercícios, músculos ou movimentos")).toBeFocused();
});

test("inspeção automática das telas principais, temas e diálogos", async ({ page }) => {
  await openApp(page);
  const views = ["Visão geral", "Meus treinos", "Exercícios", "Diário de treino", "Evolução", "Assistente", "Configurações"];
  for (const view of views) { await openView(page, view); await audit(page); }
  await page.getByRole("button", { name: "Metas & parâmetros" }).click();
  await audit(page);
  await page.getByRole("button", { name: "Meus dados" }).click();
  await audit(page);
  await page.getByRole("button", { name: "Meu perfil" }).click();
  await page.getByRole("button", { name: "Noite · vermelho (herança do Diário)" }).click();
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("noite");
  for (const view of views) { await openView(page, view); await audit(page); }
  await page.getByRole("button", { name: "Forma · verde sálvia" }).click();
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("forma");
  await openView(page, "Meus treinos");
  await page.getByRole("button", { name: "Novo treino" }).click();
  await audit(page);
  await page.getByRole("button", { name: "Fechar janela" }).click();
  await openView(page, "Exercícios");
  await page.getByRole("button", { name: "Novo exercício" }).click();
  await audit(page);
});

test("criação, edição e exclusão de treino preservam os demais registros", async ({ page }) => {
  await openApp(page);
  await openView(page, "Meus treinos");
  await page.getByRole("button", { name: "Novo treino" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome do treino").fill("Treino de teste");
  await dialog.getByRole("button", { name: "Salvar treino" }).click();
  await expect(dialog.getByRole("alert")).toContainText("adicione pelo menos um exercício");
  await dialog.getByLabel("Buscar no catálogo").fill("Supino reto com barra");
  await dialog.getByRole("button", { name: /Supino reto com barra/ }).click();
  await dialog.getByRole("button", { name: "Salvar treino" }).click();
  await expect(dialog).toHaveCount(0);
  let card = page.locator(".plan-card").filter({ has: page.getByRole("heading", { name: "Treino de teste", exact: true }) });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Editar", exact: true }).click();
  await dialog.getByLabel("Nome do treino").fill("Treino editado");
  await dialog.getByRole("button", { name: "Salvar treino" }).click();
  await expect(dialog).toHaveCount(0);
  card = page.locator(".plan-card").filter({ has: page.getByRole("heading", { name: "Treino editado", exact: true }) });
  await card.getByRole("button", { name: "Opções de Treino editado" }).click();
  page.once("dialog", dialogEvent => dialogEvent.accept());
  await card.getByRole("button", { name: "Excluir treino" }).click();
  await expect(card).toHaveCount(0);
  const data = await readData(page);
  expect(data.plans).toHaveLength(4);
  expect(data.logs).toHaveLength(12);
});

test("check-in, relógio de sessão e descanso respondem à interação", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Fazer check-in" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Cansado/ }).click();
  await dialog.getByRole("button", { name: "Salvar check-in" }).click();
  await expect(dialog).toHaveCount(0);
  expect((await readData(page)).settings.checkIn?.score).toBe(2);
  await openView(page, "Meus treinos");
  const card = page.locator(".plan-card").filter({ has: page.getByRole("heading", { name: "Upper A", exact: true }) });
  await card.getByRole("button", { name: "Começar treino" }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.locator(".session-timer")).not.toHaveText("00:00", { timeout: 5000 });
  await dialog.getByRole("button", { name: "Concluir série 1 de Supino reto com barra" }).click();
  const rest = dialog.locator(".rest-pill");
  await expect(rest).toBeVisible();
  const firstTime = await rest.innerText();
  await expect(rest).not.toHaveText(firstTime, { timeout: 5000 });
  await dialog.getByRole("button", { name: "Cancelar descanso" }).click();
  await expect(rest).toHaveCount(0);
  page.once("dialog", event => event.accept());
  await dialog.getByRole("button", { name: "Fechar janela" }).click();
  await expect(dialog).toHaveCount(0);
});

test("falha ao abrir dados corrompidos oferece recuperação por backup", async ({ page }) => {
  await openApp(page);
  const backup = Buffer.from(JSON.stringify({ version: 1, ...(await readData(page)) }));
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("forma-pages", 1);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("profile", "readwrite");
      tx.objectStore("profile").put({ id: "main", version: 1, data: { broken: true } });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  }));
  await page.reload();
  await expect(page.getByText("Não foi possível abrir os dados deste navegador. Eles não foram substituídos.")).toBeVisible();
  const input = page.getByLabel("Selecionar backup para recuperação");
  await input.setInputFiles({ name: "incorreto.json", mimeType: "application/json", buffer: Buffer.from("{}") });
  await expect(page.getByText("Este arquivo não é um backup completo válido do Forma.")).toBeVisible();
  page.once("dialog", event => event.accept());
  await input.setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: backup });
  await expect(page.getByRole("heading", { name: "Seu treino, em equilíbrio." })).toBeVisible();
  expect((await readData(page)).logs).toHaveLength(12);
});

test("outra aba do mesmo navegador atualiza a interface após salvar", async ({ page, context }) => {
  await openApp(page);
  const other = await context.newPage();
  await openApp(other);
  await openView(page, "Configurações");
  await page.getByLabel("Como podemos chamar você?").fill("Perfil compartilhado");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(other.locator(".profile-copy strong")).toHaveText("Perfil compartilhado");
  await other.close();
});

test("as sete telas cabem em larguras de 320 a 1440 pixels", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const width of [320, 390, 700, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    await openApp(page);
    for (const view of ["Meus treinos", "Exercícios", "Diário de treino", "Evolução", "Assistente", "Configurações"]) {
      if (width <= 700) await page.getByRole("button", { name: "Abrir navegação" }).click();
      await openView(page, view);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${view}, ${width}px`).toBe(true);
    }
  }
  expect(errors).toEqual([]);
});

test("criação e edição de exercício pessoal", async ({ page }) => {
  await openApp(page);
  await openView(page, "Exercícios");
  await page.getByRole("button", { name: "Novo exercício" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Salvar exercício" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Confira o nome");
  await dialog.getByLabel("Nome do exercício").fill("Movimento pessoal de teste");
  await dialog.getByRole("button", { name: "Salvar exercício" }).click();
  await expect(dialog).toHaveCount(0);
  const first = await readData(page);
  const exercise = first.exercises.find(item => item.name === "Movimento pessoal de teste");
  expect(exercise).toBeTruthy();
  expect(first.userExerciseIds).toContain(exercise?.id);
  await page.getByLabel("Buscar exercícios, músculos ou movimentos").fill("Movimento pessoal de teste");
  await page.getByRole("button", { name: "Movimento pessoal de teste", exact: true }).click();
  await dialog.getByRole("button", { name: "Editar facetas" }).click();
  await dialog.getByLabel("Nome do exercício").fill("Movimento editado");
  await dialog.getByRole("button", { name: "Salvar exercício" }).click();
  await expect(dialog).toHaveCount(0);
  expect((await readData(page)).exercises.some(item => item.name === "Movimento editado")).toBe(true);
});

test("inspeção automática de outros diálogos e parâmetros no tema noturno", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Fazer check-in" }).click();
  await audit(page);
  await page.getByRole("dialog").getByRole("button", { name: "Fechar janela" }).click();
  await page.getByRole("button", { name: "Registrar treino", exact: true }).first().click();
  await audit(page);
  await page.getByRole("dialog").getByRole("button", { name: /Upper A/ }).click();
  await audit(page);
  await page.getByRole("dialog").getByRole("button", { name: "Fechar janela" }).click();
  await openView(page, "Diário de treino");
  await page.getByRole("button", { name: "Importar do Diário" }).click();
  await audit(page);
  await page.getByRole("dialog").getByRole("button", { name: "Fechar janela" }).click();
  await page.getByRole("button", { name: /Ver registro de/ }).first().click();
  await audit(page);
  await page.getByRole("dialog").getByRole("button", { name: "Fechar janela" }).click();
  await page.getByRole("button", { name: "Explore o guia Forma" }).click();
  await audit(page);
  await page.getByRole("dialog").getByRole("button", { name: "Fechar janela" }).click();
  await openView(page, "Configurações");
  await page.getByRole("button", { name: "Noite · vermelho (herança do Diário)" }).click();
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("noite");
  await page.getByRole("button", { name: "Metas & parâmetros" }).click();
  await audit(page);
  await page.getByRole("button", { name: "Meus dados" }).click();
  await audit(page);
  await openView(page, "Visão geral");
  await page.getByRole("button", { name: "Fazer check-in" }).click();
  await audit(page);
  await page.getByRole("dialog").getByRole("button", { name: "Fechar janela" }).click();
  await page.getByRole("button", { name: "Registrar treino", exact: true }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /Upper A/ }).click();
  await audit(page);
  await page.getByRole("dialog").getByRole("button", { name: "Fechar janela" }).click();
  await page.getByRole("button", { name: "Explore o guia Forma" }).click();
  await audit(page);
});

test("inspeção automática das sete telas móveis nos dois temas", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  const views = ["Visão geral", "Meus treinos", "Exercícios", "Diário de treino", "Evolução", "Assistente", "Configurações"];
  for (const view of views) {
    await page.getByRole("button", { name: "Abrir navegação" }).click();
    await openView(page, view);
    await audit(page);
  }
  await page.getByRole("button", { name: "Noite · vermelho (herança do Diário)" }).click();
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("noite");
  for (const view of views) {
    await page.getByRole("button", { name: "Abrir navegação" }).click();
    await openView(page, view);
    await audit(page);
  }
});
