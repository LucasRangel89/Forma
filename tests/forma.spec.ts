import { test, expect } from "@playwright/test";
import { execSync } from "node:child_process";
import { engineProbes } from "./engine-probes";

const URL = "http://localhost:3000";
test.setTimeout(45000);
test.use({ viewport: { width: 1440, height: 1080 }, baseURL: URL, actionTimeout: 10000 });
test.beforeAll(() => {
  execSync("psql postgresql://postgres:postgres@127.0.0.1:5432/app_db -q -c 'TRUNCATE forma_workout_logs, forma_workout_plans, forma_exercises, forma_profiles CASCADE'");
});

test("motor: referência 51/26, RIR vazio, aquecimento, janelas e importador", async () => {
  const p = engineProbes();
  expect(p.vol).toBe(10);
  expect(p.secondaryVol).toBe(5);
  expect(p.fatDay1).toBe(51);
  expect(p.fatDay2).toBe(26);
  expect(p.warmupVol).toBe(10);
  expect(p.rir2Vol).toBe(10);
  expect(p.calInWeek).toBe(10);
  expect(p.rollingBoth).toBe(20);
  expect(p.matchedAlias).toBe("supino-reto-com-barra");
  expect(p.matchedStripped).toBe("supino-reto-com-barra");
  expect(p.built.matched).toBe(1);
  expect(p.built.pending).toHaveLength(1);
  expect(p.built.custom[0].primary).toEqual([expect.objectContaining({ muscle: "quadriceps", weight: 0.6 }), expect.objectContaining({ muscle: "posterior", weight: 0.4 })]);
});

test("desktop: boxes, modo academia, importação, vínculo, tema e assistente", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(URL);
  await expect(page.getByRole("button", { name: "Tudo salvo. Tudo seu." })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".fatigue-boxes").first()).toHaveCount(1);
  await expect(page.locator(".fatigue-boxes .fatigue-box").first().locator("..")).not.toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Boss da semana" })).toBeVisible();
  await page.getByRole("button", { name: "7 grossos" }).click();
  await expect(page.locator(".fatigue-box")).toHaveCount(7);
  await page.getByRole("button", { name: "10 grupos" }).click();
  await expect(page.locator(".fatigue-box")).toHaveCount(10);
  await page.screenshot({ path: "artifacts/forma-desktop.png", fullPage: true });
  await page.getByRole("link", { name: "Exercícios", exact: true }).click();
  await page.getByRole("button", { name: "Novo exercício", exact: true }).click();
  await page.getByLabel("Nome do exercício", { exact: true }).fill("Rosca pessoal na polia");
  await page.getByLabel("Articulações envolvidas").selectOption("1");
  await page.getByLabel("Padrão de movimento").selectOption("Flexão de cotovelo");
  await page.getByLabel("Músculo", { exact: true }).selectOption("biceps");
  await page.getByRole("dialog").getByRole("button", { name: "Halter", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Polia", exact: true }).click();
  await page.getByRole("button", { name: "Salvar exercício", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("link", { name: "Meus treinos", exact: true }).click();
  const firstPlan = page.locator(".plan-card").first();
  await firstPlan.getByRole("button", { name: "Começar treino" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("RIR da série 1 de Supino reto com barra, opcional").fill("");
  await page.getByRole("button", { name: "Concluir série 1 de Supino reto com barra" }).click();
  await expect(page.locator(".rest-pill")).toBeVisible();
  await page.getByRole("button", { name: "Concluir séries deste exercício" }).click();
  await page.getByRole("button", { name: "Finalizar e salvar" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("link", { name: "Diário de treino", exact: true }).click();
  await page.getByPlaceholder("Buscar no diário...").fill("upper");
  const firstRow = page.locator(".recent-table tbody tr").first();
  await expect(firstRow).toBeVisible();
  await firstRow.getByRole("button", { name: /Ver registro de/ }).click();
  await expect(page.getByRole("dialog").getByText("Trabalho").first()).toBeVisible();
  await page.getByRole("button", { name: "Fechar janela" }).click();
  await page.getByRole("button", { name: "Importar do Diário" }).click();
  const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  const importDate = daysAgo(5);
  const payload = { sessions: [
    { date: importDate, name: "Supino  reto c/ barra", group: "Peito", weight: 62.5, reps: [8, 8, 6] },
    { date: daysAgo(4), name: "Exercício do meu diário", group: "Pernas", weight: 40, reps: [10, 10] },
  ] };
  await page.setInputFiles("input[type=file]", { name: "diario.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(payload)) });
  await expect(page.getByText(`${importDate} · Peito · 62.5 kg × 3 séries`)).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: /Importar/ }).click();
  await expect(page.getByRole("heading", { name: "Importação concluída" })).toBeVisible();
  await page.getByRole("dialog").getByLabel(/Vincular/).selectOption({ label: "Leg press 45°" });
  await page.getByRole("dialog").getByRole("button", { name: "Vincular", exact: true }).click();
  await expect(page.getByRole("dialog").locator(".link-row")).toHaveCount(0);
  await page.getByRole("dialog").getByRole("button", { name: "Concluir" }).click();
  await page.getByPlaceholder("Buscar no diário...").fill("supino");
  await expect(page.locator(".recent-table tbody tr").first()).toBeVisible();
  await page.getByRole("link", { name: "Configurações", exact: true }).click();
  await page.getByRole("button", { name: "Noite · vermelho (herança do Diário)" }).click();
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("noite");
  await page.getByRole("button", { name: "Forma · verde sálvia" }).click();
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("forma");
  await page.getByLabel("Como podemos chamar você?").fill("Perfil de teste");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await page.getByRole("link", { name: "Assistente", exact: false }).click();
  await page.getByRole("button", { name: "Gerar sugestão de programa" }).click();
  await expect(page.locator(".generated-plans>div")).toHaveCount(4);
  await page.getByRole("button", { name: "Adicionar ao meu planejamento" }).click();
  await expect(page.locator(".plan-card")).toHaveCount(8);
  const response = await page.request.get(`${URL}/api/app`);
  const { data } = await response.json();
  expect(data.exercises.length).toBe(121);
  expect(data.logs.filter((l: { demo: boolean }) => !l.demo)).toHaveLength(3);
  expect(data.settings.name).toBe("Perfil de teste");
  expect(data.settings.nameAliases["exercicio do meu diario"]).toBe("leg-press-45");
  expect(data.userExerciseIds).toHaveLength(1);
  expect(data.userExerciseIds[0].startsWith("rosca-pessoal-na-polia")).toBeTruthy();
  expect(errors).toEqual([]);
});

test("mobile: responsive, navegação, boxes e filtros", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(URL);
  await expect(page.getByRole("heading", { name: "Seu treino, em equilíbrio." })).toBeVisible();
  await expect(page.locator(".fatigue-boxes")).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: "artifacts/forma-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
  await page.getByRole("button", { name: "Abrir navegação" }).click();
  await page.getByRole("link", { name: "Exercícios", exact: true }).click();
  await expect(page.locator(".sidebar.is-open")).toHaveCount(0);
  await page.getByPlaceholder("Busque um exercício, músculo ou movimento...").fill("inexistente");
  await expect(page.getByRole("heading", { name: "Nenhum movimento por aqui" })).toBeVisible();
  await page.getByRole("button", { name: "Limpar todos os filtros" }).click();
  await expect(page.locator(".exercise-card")).toHaveCount(12);
  await page.screenshot({ path: "artifacts/forma-mobile-catalog.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
});

test("API: importação, vínculo e isolamento dos perfis", async ({ request }) => {
  const first = await request.get(`${URL}/api/app`);
  expect(first.ok()).toBeTruthy();
  const firstCookie = first.headers()["set-cookie"].split(";")[0];
  const bad = await request.post(`${URL}/api/app`, { headers: { Cookie: firstCookie }, data: { action: "logWorkout", payload: { duration: -2 } } });
  expect(bad.status()).toBe(400);
  const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  const importRes = await request.post(`${URL}/api/app`, { headers: { Cookie: firstCookie }, data: { action: "importDiario", payload: { sessions: [
    { date: daysAgo(6), name: "Stiff", group: "Pernas", weight: 80, reps: [8, 8] },
    { date: daysAgo(5), name: "Exercício API", group: "Peito", weight: 20, reps: [12] },
  ] } } });
  expect(importRes.ok()).toBeTruthy();
  const imported = (await importRes.json()).data;
  expect(imported.logs.filter((l: { notes: string }) => l.notes.startsWith("Importado"))).toHaveLength(2);
  expect(imported.userExerciseIds).toHaveLength(1);
  const stiffLog = imported.logs.find((l: { name: string }) => l.name === "Stiff");
  expect(stiffLog.entries[0].exerciseId).toBe("levantamento-terra-romeno");
  const linkRes = await request.post(`${URL}/api/app`, { headers: { Cookie: firstCookie }, data: { action: "linkExercise", payload: { exerciseId: imported.userExerciseIds[0], targetId: "agachamento-livre" } } });
  expect(linkRes.ok()).toBeTruthy();
  const linked = (await linkRes.json()).data;
  expect(linked.userExerciseIds).toHaveLength(0);
  const linkedLog = linked.logs.find((l: { name: string }) => l.name === "Exercício API");
  expect(linkedLog.entries[0].exerciseId).toBe("agachamento-livre");
  expect(linked.settings.nameAliases["exercicio api"]).toBe("agachamento-livre");
  const other = await request.get(`${URL}/api/app`, { headers: { Cookie: "forma-profile=00000000-1111-4222-8333-444444444444" } });
  const otherData = (await other.json()).data;
  expect(otherData.plans[0].id).not.toBe((await importRes.json()).data.plans[0].id);
  const foreign = await request.post(`${URL}/api/app`, { headers: { Cookie: firstCookie }, data: { action: "savePlan", payload: otherData.plans[0] } });
  expect(foreign.status()).toBe(400);
});

test("preview incorporado: cookie particionado preserva o perfil", async ({ page }) => {
  await page.goto("http://127.0.0.1:3000", { waitUntil: "networkidle" });
  await page.setContent(`<html><body><iframe id="forma-embed" src="${URL}" style="width:1200px;height:900px"></iframe></body></html>`);
  await expect(page.frameLocator("#forma-embed").getByRole("button", { name: "Tudo salvo. Tudo seu." })).toBeVisible();
  const embedded = page.frames().find(frame => frame.url().startsWith(URL));
  expect(embedded).toBeTruthy();
  const result = await embedded!.evaluate(async () => {
    const before = await (await fetch("/api/app")).json();
    const saved = await fetch("/api/app", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "checkIn", payload: 5 }) });
    const after = await (await fetch("/api/app")).json();
    return { status: saved.status, score: after.data.settings.checkIn?.score, sameProfile: before.data.plans[0].id === after.data.plans[0].id };
  });
  expect(result).toEqual({ status: 200, score: 5, sameProfile: true });
});
