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

test("sessão ajustável registra aquecimentos e exercícios extras sem alterar o plano", async ({ page }) => {
  await openApp(page);
  const initial = await readData(page);
  const initialPlan = structuredClone(initial.plans.find(plan => plan.name === "Upper A")!);
  await page.getByRole("button", { name: "Registrar treino", exact: true }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /Upper A/ }).click();
  const dialog = page.getByRole("dialog");
  const first = dialog.getByRole("group", { name: "Série 1 de Supino reto com barra" });
  const second = dialog.getByRole("group", { name: "Série 2 de Supino reto com barra" });
  const third = dialog.getByRole("group", { name: "Série 3 de Supino reto com barra" });
  // The example sessions must never prefill the person's load or effort.
  await expect(first.getByLabel("Carga da série 1 de Supino reto com barra")).toHaveValue("0");
  await expect(first.getByLabel("RIR da série 1 de Supino reto com barra, opcional")).toHaveValue("");
  await first.getByLabel("Carga da série 1 de Supino reto com barra").fill("20");
  await first.getByLabel("Aquecimento").check();
  await first.getByRole("button", { name: "Concluir série 1 de Supino reto com barra" }).click();
  await expect(dialog.locator(".rest-pill")).toHaveCount(0); // Retrospective registration does not start a rest timer.
  await second.getByLabel("Carga da série 2 de Supino reto com barra").fill("60");
  await second.getByLabel("Repetições da série 2 de Supino reto com barra").fill("8");
  await second.getByLabel("RIR da série 2 de Supino reto com barra, opcional").fill("2");
  await second.getByRole("button", { name: "Concluir série 2 de Supino reto com barra" }).click();
  await third.getByLabel("Aquecimento").check(); // Not completed: must not be saved.
  await dialog.getByRole("button", { name: "Adicionar série", exact: true }).click();
  const fourth = dialog.getByRole("group", { name: "Série 4 de Supino reto com barra" });
  await fourth.getByLabel("Carga da série 4 de Supino reto com barra").fill("65");
  await fourth.getByRole("button", { name: "Concluir série 4 de Supino reto com barra" }).click();
  await dialog.getByRole("button", { name: "Adicionar exercício à sessão" }).click();
  await dialog.getByLabel("Buscar exercício para a sessão").fill("Agachamento livre");
  await dialog.getByRole("button", { name: /Agachamento livre/ }).click();
  await expect(dialog.locator(".session-exercise-heading").filter({ hasText: "Agachamento livre" })).toBeFocused();
  const extra = dialog.getByRole("group", { name: "Série 1 de Agachamento livre" });
  await extra.getByLabel("Carga da série 1 de Agachamento livre").fill("45");
  await extra.getByRole("button", { name: "Concluir série 1 de Agachamento livre" }).click();
  await dialog.getByRole("button", { name: "Finalizar e salvar" }).click();
  await expect(dialog).toHaveCount(0);
  const after = await readData(page);
  expect(after.plans.find(plan => plan.id === initialPlan.id)).toEqual(initialPlan);
  const log = after.logs.find(item => !item.demo)!;
  expect(log.entries).toHaveLength(2);
  expect(log.entries[0].sets).toHaveLength(3);
  expect(log.entries[0].sets.map(set => [set.weight, set.warmup])).toEqual([[20, true], [60, false], [65, false]]);
  expect(log.entries[1].exerciseId).toBe("agachamento-livre");
  // The next session prefills only the most recent real working sets, not warm-ups.
  await page.getByRole("button", { name: "Registrar treino", exact: true }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /Upper A/ }).click();
  await expect(page.getByRole("dialog").getByLabel("Carga da série 1 de Supino reto com barra")).toHaveValue("60");
  await expect(page.getByRole("dialog").getByLabel("Carga da série 2 de Supino reto com barra")).toHaveValue("65");
  await page.getByRole("dialog").getByRole("button", { name: "Fechar janela" }).click();
});

test("treino livre e edição do histórico preservam plano e identidade e rejeitam dados inválidos", async ({ page }) => {
  await openApp(page);
  const initial = await readData(page);
  await page.getByRole("button", { name: "Registrar treino", exact: true }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Registrar treino livre" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome da sessão").fill("Treino avulso de teste");
  await dialog.getByLabel("Duração (minutos)").fill("37");
  await dialog.getByLabel("Buscar exercício para a sessão").fill("Supino reto com barra");
  await dialog.getByRole("button", { name: /Supino reto com barra/ }).click();
  await dialog.getByLabel("Carga da série 1 de Supino reto com barra").fill("50");
  await dialog.getByLabel("Repetições da série 1 de Supino reto com barra").fill("10");
  await dialog.getByRole("button", { name: "Concluir série 1 de Supino reto com barra" }).click();
  await dialog.getByRole("button", { name: "Finalizar e salvar" }).click();
  let after = await readData(page);
  const original = after.logs.find(item => !item.demo)!;
  expect(original.planId).toBeNull();
  expect(original.duration).toBe(37);
  expect(after.plans).toEqual(initial.plans);
  await openView(page, "Diário de treino");
  await page.getByRole("button", { name: /Ver registro de Treino avulso de teste/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Editar registro" }).click();
  dialog = page.getByRole("dialog", { name: "Corrigir registro" });
  await dialog.getByLabel("Nome do registro").fill("Treino corrigido");
  await dialog.getByLabel("Data e hora").fill("2999-01-01T12:00");
  await dialog.getByRole("button", { name: "Salvar correções" }).click();
  await expect(dialog.getByRole("alert")).toContainText("futura");
  expect((await readData(page)).logs.find(log => log.id === original.id)?.name).toBe(original.name);
  // Restore the original date, retaining its exact seconds on save.
  const local = new Date(original.date);
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}`;
  await dialog.getByLabel("Data e hora").fill(date);
  await dialog.getByLabel("Carga da série 1 de Supino reto com barra").fill("55");
  await dialog.getByLabel("RIR da série 1 de Supino reto com barra, opcional").fill("1");
  await dialog.getByLabel("Notas da sessão").fill("Carga corrigida após o treino.");
  await dialog.getByRole("button", { name: "Adicionar série", exact: true }).click();
  const second = dialog.getByRole("group", { name: "Série 2 de Supino reto com barra" });
  await second.getByLabel("Aquecimento").check();
  await second.getByLabel("Carga da série 2 de Supino reto com barra").fill("20");
  await dialog.getByRole("button", { name: "Salvar correções" }).click();
  await expect(dialog).toHaveCount(0);
  after = await readData(page);
  const corrected = after.logs.find(log => log.id === original.id)!;
  expect(corrected).toMatchObject({ name: "Treino corrigido", date: original.date, planId: null, demo: false, notes: "Carga corrigida após o treino." });
  expect(corrected.entries[0].sets.map(set => [set.weight, set.rir, set.warmup])).toEqual([[55, 1, false], [20, null, true]]);
  expect(after.plans).toEqual(initial.plans);
});

test("rascunho recupera alterações após recarga e pode ser guardado, retomado e finalizado", async ({ page, context }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Registrar treino", exact: true }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /Upper A/ }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Carga da série 1 de Supino reto com barra").fill("62.5");
  await dialog.getByLabel("Repetições da série 1 de Supino reto com barra").fill("0"); // Invalid values are recoverable too.
  await dialog.getByRole("button", { name: "Concluir série 1 de Supino reto com barra" }).click();
  await dialog.getByLabel("Como foi o treino?").fill("Rascunho recuperável");
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("forma-session-draft-v1"))).not.toBeNull();
  page.once("dialog", event => event.accept());
  await page.reload({ waitUntil: "networkidle" });
  const banner = page.getByRole("region", { name: "Rascunho de treino" });
  await expect(banner).toContainText("Upper A");
  // A different tab gets its own session storage and cannot see this draft.
  const other = await context.newPage();
  await openApp(other);
  await expect(other.getByRole("region", { name: "Rascunho de treino" })).toHaveCount(0);
  await other.close();
  await banner.getByRole("button", { name: "Continuar treino" }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Carga da série 1 de Supino reto com barra")).toHaveValue("62.5");
  await expect(dialog.getByLabel("Repetições da série 1 de Supino reto com barra")).toHaveValue("0");
  await expect(dialog.getByLabel("Como foi o treino?")).toHaveValue("Rascunho recuperável");
  await dialog.getByRole("button", { name: "Guardar rascunho" }).click();
  await expect(banner).toBeVisible();
  await expect(banner).toBeFocused();
  await banner.getByRole("button", { name: "Continuar treino" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Repetições da série 1 de Supino reto com barra").fill("8");
  await dialog.getByRole("button", { name: "Finalizar e salvar" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(banner).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem("forma-session-draft-v1"))).toBeNull();
  expect((await readData(page)).logs.find(log => !log.demo)?.entries[0].sets[0].weight).toBe(62.5);
});

test("armazenamento de rascunho indisponível avisa e não impede o salvamento do treino", async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === "forma-session-draft-v1") throw new DOMException("Sem espaço", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await openApp(page);
  await page.getByRole("button", { name: "Registrar treino", exact: true }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /Upper A/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Concluir série 1 de Supino reto com barra" }).click();
  await expect(dialog.getByRole("status")).toContainText("indisponível");
  await dialog.getByRole("button", { name: "Guardar rascunho" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Não foi possível guardar");
  await dialog.getByRole("button", { name: "Finalizar e salvar" }).click();
  await expect(dialog).toHaveCount(0);
  expect((await readData(page)).logs.filter(log => !log.demo)).toHaveLength(1);
});

test("edições simultâneas não sobrescrevem o registro mais recente", async ({ page, context }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Registrar treino", exact: true }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /Upper A/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Concluir série 1 de Supino reto com barra" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Finalizar e salvar" }).click();
  const id = (await readData(page)).logs.find(log => !log.demo)!.id;
  const other = await context.newPage();
  await openApp(other);
  for (const tab of [page, other]) {
    await openView(tab, "Diário de treino");
    await tab.getByRole("button", { name: /Ver registro de Upper A/ }).first().click();
    await tab.getByRole("dialog").getByRole("button", { name: "Editar registro" }).click();
  }
  await page.getByRole("dialog").getByLabel("Notas da sessão").fill("Alteração antiga");
  await other.getByRole("dialog").getByLabel("Notas da sessão").fill("Alteração mais recente");
  await other.getByRole("dialog").getByRole("button", { name: "Salvar correções" }).click();
  await expect(other.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("dialog").getByRole("button", { name: "Salvar correções" }).click();
  await expect(page.locator(".toast[role=alert]")).toContainText("alterado em outra aba");
  await expect(page.getByRole("dialog").getByLabel("Notas da sessão")).toHaveValue("Alteração antiga");
  expect((await readData(page)).logs.find(log => log.id === id)?.notes).toBe("Alteração mais recente");
  page.once("dialog", event => event.accept());
  await page.getByRole("dialog").getByRole("button", { name: "Fechar janela" }).click(); // discard stale edits, back to old detail
  page.once("dialog", event => event.accept());
  await page.getByRole("dialog").getByRole("button", { name: "Excluir registro" }).click();
  await expect(page.locator(".toast[role=alert]")).toContainText("Reabra-o antes de excluir");
  expect((await readData(page)).logs.find(log => log.id === id)?.notes).toBe("Alteração mais recente");
  await other.close();
});

test("evolução de força separa exemplos e usa apenas séries de trabalho válidas", async ({ page }) => {
  await openApp(page);
  const initial = await readData(page);
  const makeLog = (id: string, daysAgo: number, sets: Array<{ reps: number; weight: number; rir: number | null; completed: boolean; warmup?: boolean }>) => ({
    id, planId: initial.plans.find(plan => plan.name === "Upper A")!.id, name: "Upper A real", date: new Date(Date.now() - daysAgo * 86400000).toISOString(), duration: 30, notes: "", demo: false,
    entries: [{ exerciseId: "supino-reto-com-barra", sets }],
  });
  const logs = [
    makeLog("forca-antiga", 5, [{ reps: 1, weight: 50, rir: 2, completed: true }, { reps: 10, weight: 200, rir: null, completed: true, warmup: true }]),
    makeLog("forca-recente", 1, [{ reps: 10, weight: 60, rir: 2, completed: true }, { reps: 10, weight: 500, rir: 2, completed: false }]),
  ];
  await page.evaluate(data => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("forma-pages", 1);
    request.onsuccess = () => { const db = request.result; const tx = db.transaction("profile", "readwrite"); tx.objectStore("profile").put({ id: "main", version: 1, data }); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
    request.onerror = () => reject(request.error);
  }), { ...initial, logs: [...initial.logs, ...logs] });
  await page.reload({ waitUntil: "networkidle" });
  await openView(page, "Evolução");
  await page.getByRole("button", { name: "Força & progressão" }).click();
  const card = page.locator(".strength-card");
  await expect(card.getByLabel("Exercício para acompanhar força")).toHaveValue("supino-reto-com-barra");
  await expect(card.locator(".strength-stats")).toContainText("80 kg");
  await expect(card.locator(".strength-stats")).toContainText("+30 kg");
  await expect(card.locator(".strength-table tbody tr")).toHaveCount(2);
  await expect(card.locator(".strength-table")).toContainText("50 kg × 1");
  await expect(card.locator(".strength-table")).not.toContainText("200 kg");
  await card.getByLabel("Incluir exemplos").check();
  await expect(card.getByLabel("Exercício para acompanhar força")).toHaveValue("supino-reto-com-barra");
  expect(await card.locator(".strength-table tbody tr").count()).toBeGreaterThan(2);
  await expect(card.locator(".strength-table")).toContainText("Exemplo");
  await card.getByLabel("Incluir exemplos").uncheck();
  await card.getByRole("button", { name: /Abrir Upper A real/ }).first().click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Editar registro" })).toBeVisible();
});

test("novos fluxos cabem em telas estreitas e passam na inspeção automática nos dois temas", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await openApp(page);
  for (const night of [false, true]) {
    if (night) {
      await page.getByRole("button", { name: "Abrir navegação" }).click();
      await openView(page, "Configurações");
      await page.getByRole("button", { name: "Noite · vermelho (herança do Diário)" }).click();
      await page.getByRole("button", { name: "Salvar alterações" }).click();
      await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("noite");
      await page.getByRole("button", { name: "Abrir navegação" }).click();
      await openView(page, "Visão geral");
    }
    await page.getByRole("button", { name: "Registrar treino", exact: true }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Registrar treino livre" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Buscar exercício para a sessão").fill("Supino reto com barra");
    await dialog.getByRole("button", { name: /Supino reto com barra/ }).click();
    await audit(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await dialog.getByRole("button", { name: "Concluir série 1 de Supino reto com barra" }).click();
    await dialog.getByRole("button", { name: "Finalizar e salvar" }).click();
    await page.getByRole("button", { name: "Abrir navegação" }).click();
    await openView(page, "Diário de treino");
    await page.getByRole("button", { name: /Ver registro de Treino livre/ }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Editar registro" }).click();
    dialog = page.getByRole("dialog");
    await audit(page);
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await dialog.getByRole("button", { name: "Fechar janela" }).click(); // back to the record detail
    await page.getByRole("dialog").getByRole("button", { name: "Fechar janela" }).click();
    await page.getByRole("button", { name: "Abrir navegação" }).click();
    await openView(page, "Evolução");
    await page.getByRole("button", { name: "Força & progressão" }).click();
    await audit(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (!night) {
      await page.getByRole("button", { name: "Abrir navegação" }).click();
      await openView(page, "Visão geral");
    }
  }
});

test("rascunho ilegível ou anterior não é descartado sem confirmação", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => sessionStorage.setItem("forma-session-draft-v1", "{corrompido"));
  await page.reload({ waitUntil: "networkidle" });
  const banner = page.getByRole("region", { name: "Rascunho de treino" });
  await expect(banner).toContainText("Não foi possível ler");
  await page.getByRole("button", { name: "Registrar treino", exact: true }).first().click();
  page.once("dialog", event => event.dismiss());
  await page.getByRole("dialog").getByRole("button", { name: /Upper A/ }).click();
  await expect(page.getByRole("dialog", { name: "Qual foi o treino de hoje?" })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("forma-session-draft-v1"))).toBe("{corrompido");
  await page.getByRole("dialog").getByRole("button", { name: "Fechar janela" }).click();
  page.once("dialog", event => event.accept());
  await banner.getByRole("button", { name: "Descartar rascunho" }).click();
  await expect(banner).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem("forma-session-draft-v1"))).toBeNull();
});

test("rascunho de treino livre é retomado e preserva o nome sem criar plano", async ({ page }) => {
  await openApp(page);
  const plans = (await readData(page)).plans;
  await page.getByRole("button", { name: "Registrar treino", exact: true }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Registrar treino livre" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome da sessão").fill("Treino livre retomado");
  await dialog.getByLabel("Buscar exercício para a sessão").fill("Supino reto com barra");
  await dialog.getByRole("button", { name: /Supino reto com barra/ }).click();
  await dialog.getByRole("button", { name: "Concluir série 1 de Supino reto com barra" }).click();
  await dialog.getByRole("button", { name: "Guardar rascunho" }).click();
  await expect(page.getByRole("region", { name: "Rascunho de treino" })).toContainText("Treino livre retomado");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("region", { name: "Rascunho de treino" }).getByRole("button", { name: "Continuar treino" }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Nome da sessão")).toHaveValue("Treino livre retomado");
  await dialog.getByRole("button", { name: "Finalizar e salvar" }).click();
  const data = await readData(page);
  expect(data.logs.find(log => !log.demo)).toMatchObject({ name: "Treino livre retomado", planId: null });
  expect(data.plans).toEqual(plans);
});

test("rascunho com exercício ausente permite vincular outro sem perder séries", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Registrar treino", exact: true }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Registrar treino livre" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Buscar exercício para a sessão").fill("Agachamento livre");
  await dialog.getByRole("button", { name: /Agachamento livre/ }).click();
  await dialog.getByLabel("Carga da série 1 de Agachamento livre").fill("42.25");
  await dialog.getByRole("button", { name: "Concluir série 1 de Agachamento livre" }).click();
  await dialog.getByRole("button", { name: "Guardar rascunho" }).click();
  await page.evaluate(() => {
    const key = "forma-session-draft-v1", draft = JSON.parse(sessionStorage.getItem(key)!);
    draft.entries[0].prescription.exerciseId = "removido-do-catalogo";
    sessionStorage.setItem(key, JSON.stringify(draft));
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("region", { name: "Rascunho de treino" }).getByRole("button", { name: "Continuar treino" }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/Um exercício desta sessão não está mais no catálogo/)).toBeVisible();
  await dialog.getByRole("button", { name: "Finalizar e salvar" }).click();
  await expect(dialog.getByRole("alert")).toContainText("não está mais no catálogo");
  await dialog.getByLabel("Escolha o exercício correspondente para removido-do-catalogo").selectOption("supino-reto-com-barra");
  await expect(dialog.getByLabel("Carga da série 1 de Supino reto com barra")).toHaveValue("42.25");
  await dialog.getByRole("button", { name: "Finalizar e salvar" }).click();
  const log = (await readData(page)).logs.find(item => !item.demo)!;
  expect(log.entries[0].exerciseId).toBe("supino-reto-com-barra");
  expect(log.entries[0].sets[0].weight).toBe(42.25);
  await page.getByRole("link", { name: "Diário de treino", exact: true }).click();
  await page.getByRole("button", { name: /Ver registro de Treino livre/ }).first().click();
  await expect(page.getByRole("dialog").getByText("42,25 kg", { exact: true })).toBeVisible();
});

test("dupla progressão usa séries reais completas e nunca aumenta a carga automaticamente", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Registrar treino", exact: true }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /Upper A/ }).click();
  let dialog = page.getByRole("dialog");
  for (const n of [1, 2, 3]) {
    const group = dialog.getByRole("group", { name: `Série ${n} de Supino reto com barra` });
    await group.getByLabel(`Carga da série ${n} de Supino reto com barra`).fill("50");
    await group.getByLabel(`Repetições da série ${n} de Supino reto com barra`).fill("8");
    await group.getByLabel(`RIR da série ${n} de Supino reto com barra, opcional`).fill("2");
    await group.getByRole("button", { name: `Concluir série ${n} de Supino reto com barra` }).click();
  }
  await dialog.getByRole("button", { name: "Finalizar e salvar" }).click();
  await page.getByRole("button", { name: "Registrar treino", exact: true }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /Upper A/ }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.locator(".progression-hint")).toContainText("considere o menor aumento");
  for (const n of [1, 2, 3]) {
    await expect(dialog.getByLabel(`Carga da série ${n} de Supino reto com barra`)).toHaveValue("50");
    await expect(dialog.getByLabel(`RIR da série ${n} de Supino reto com barra, opcional`)).toHaveValue("");
  }
  await dialog.getByRole("button", { name: "Fechar janela" }).click();
});

test("remoção de séries e exercícios afeta somente a sessão atual", async ({ page }) => {
  await openApp(page);
  const initial = await readData(page);
  await page.getByRole("button", { name: "Registrar treino", exact: true }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /Upper A/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Remover série 3 de Supino reto com barra" }).click();
  await expect(dialog.getByRole("group", { name: "Série 3 de Supino reto com barra" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Adicionar série", exact: true })).toBeFocused();
  await dialog.getByRole("button", { name: "Concluir série 1 de Supino reto com barra" }).click();
  page.once("dialog", event => event.dismiss());
  await dialog.getByRole("button", { name: "Remover série 1 de Supino reto com barra" }).click();
  await expect(dialog.getByRole("button", { name: "Desmarcar série 1 de Supino reto com barra" })).toBeVisible();
  page.once("dialog", event => event.accept());
  await dialog.getByRole("button", { name: "Remover exercício desta sessão" }).click();
  await expect(dialog.getByRole("button", { name: "Adicionar exercício à sessão" })).toBeFocused();
  await expect(dialog.getByText("Supino reto com barra", { exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: /Remada curvada com barra/ }).click();
  await dialog.getByRole("button", { name: "Concluir série 1 de Remada curvada com barra" }).click();
  await dialog.getByRole("button", { name: "Finalizar e salvar" }).click();
  const after = await readData(page);
  expect(after.plans).toEqual(initial.plans);
  expect(after.logs.find(log => !log.demo)?.entries.map(entry => entry.exerciseId)).toEqual(["remada-curvada-com-barra"]);
});

test("timer de descanso ativo mantém contraste nos dois temas", async ({ page }) => {
  await openApp(page);
  for (const night of [false, true]) {
    if (night) {
      await openView(page, "Configurações");
      await page.getByRole("button", { name: "Noite · vermelho (herança do Diário)" }).click();
      await page.getByRole("button", { name: "Salvar alterações" }).click();
      await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("noite");
    }
    await openView(page, "Meus treinos");
    const card = page.locator(".plan-card").filter({ has: page.getByRole("heading", { name: "Upper A", exact: true }) });
    await card.getByRole("button", { name: "Começar treino" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Concluir série 1 de Supino reto com barra" }).click();
    await expect(dialog.locator(".rest-pill")).toBeVisible();
    await audit(page);
    page.once("dialog", event => event.accept());
    await dialog.getByRole("button", { name: "Fechar janela" }).click();
  }
});

test("evolução recebe imediatamente registro criado em outra aba", async ({ page, context }) => {
  await openApp(page);
  await openView(page, "Evolução");
  await page.getByRole("button", { name: "Força & progressão" }).click();
  await expect(page.getByRole("heading", { name: "Sua curva começa no próximo treino" })).toBeVisible();
  const other = await context.newPage();
  await openApp(other);
  await other.getByRole("button", { name: "Registrar treino", exact: true }).first().click();
  await other.getByRole("dialog").getByRole("button", { name: "Registrar treino livre" }).click();
  const dialog = other.getByRole("dialog");
  await dialog.getByLabel("Buscar exercício para a sessão").fill("Supino reto com barra");
  await dialog.getByRole("button", { name: /Supino reto com barra/ }).click();
  await dialog.getByLabel("Carga da série 1 de Supino reto com barra").fill("50");
  await dialog.getByRole("button", { name: "Concluir série 1 de Supino reto com barra" }).click();
  await dialog.getByRole("button", { name: "Finalizar e salvar" }).click();
  await expect(page.locator(".strength-stats")).toContainText("63,3 kg", { timeout: 5000 });
  await other.close();
});

test("rascunho de plano removido pode ser salvo sem vínculo com o planejamento", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Registrar treino", exact: true }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /Upper A/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Concluir série 1 de Supino reto com barra" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Guardar rascunho" }).click();
  await openView(page, "Meus treinos");
  const card = page.locator(".plan-card").filter({ has: page.getByRole("heading", { name: "Upper A", exact: true }) });
  await card.getByRole("button", { name: "Opções de Upper A" }).click();
  page.once("dialog", event => event.accept());
  await card.getByRole("button", { name: "Excluir treino" }).click();
  await expect(card).toHaveCount(0);
  await page.getByRole("region", { name: "Rascunho de treino" }).getByRole("button", { name: "Continuar treino" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("O plano foi removido. Esta sessão será registrada sem vínculo com um planejamento.")).toBeVisible();
  await dialog.getByRole("button", { name: "Finalizar e salvar" }).click();
  const log = (await readData(page)).logs.find(item => !item.demo)!;
  expect(log.planId).toBeNull();
  expect(log.name).toBe("Upper A");
});

test("finalizar ou descartar não recria rascunho com gravação pendente", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const remove = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (key: string) {
      remove.call(this, key);
      if (this === sessionStorage && key === "forma-session-draft-v1") window.dispatchEvent(new Event("pagehide"));
    };
  });
  async function startAndChange() {
    await page.getByRole("button", { name: "Registrar treino", exact: true }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: /Upper A/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Concluir série 1 de Supino reto com barra" }).click();
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem("forma-session-draft-v1"))).not.toBeNull();
  }
  await startAndChange();
  await page.getByRole("dialog").getByRole("button", { name: "Finalizar e salvar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("forma-session-draft-v1"))).toBeNull();
  await startAndChange();
  page.once("dialog", event => event.accept());
  await page.getByRole("dialog").getByRole("button", { name: "Fechar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("forma-session-draft-v1"))).toBeNull();
});

test("desfazer todas as alterações não deixa rascunho antigo para retomar", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Registrar treino", exact: true }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /Upper A/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Concluir série 1 de Supino reto com barra" }).click();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("forma-session-draft-v1"))).not.toBeNull();
  await dialog.getByRole("button", { name: "Desmarcar série 1 de Supino reto com barra" }).click();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("forma-session-draft-v1"))).toBeNull();
  await page.reload();
  await expect(page.getByRole("region", { name: "Rascunho de treino" })).toHaveCount(0);
});
