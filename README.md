# forma-core — núcleo local-first (offline)

Fusão do **Diário de Cargas** + **FitEngine** + **Forma**. Sem servidor, sem dependências em produção:
módulos ES que rodam no navegador (IndexedDB) e no Node (testes).

```
src/
  util.js       datas locais (nunca UTC), normalização de texto
  taxonomy.js   22 porções → 10 grupos → 7 grupos legados do Diário; metas; estados de fadiga
  catalog.js    127 exercícios gerados por famílias + aliases + índice + validação
  engine.js     FUNÇÕES PURAS: série efetiva, volume (semana × 7 dias), fadiga exponencial,
                boxes, ordenação, substituição, avisos
  importer.js   Diário (backup JSON) → sessões/planos; idempotente; pendentes + decisões do usuário
  store.js      Store única (memória | IndexedDB) — trocar por servidor depois não muda o resto
test/           22 testes (referência numérica, importador com backup real do Diário, IndexedDB)
```

## Decisões de reconciliação

| Tema | Decisão |
|---|---|
| Músculos | 22 porções (base FitEngine) → 10 grupos (Forma) → 7 grupos do Diário (nível de agregação para os boxes) |
| Peso muscular | primário `w`; secundário `w × indirectWeight` (0,5) |
| Volume do grupo | **maior** peso entre as porções do grupo por série (supino não conta 3× peito) |
| Série efetiva | não aquecimento, concluída, RIR vazio **ou** ≤ 3 (histórico do Diário não tem RIR) |
| Fadiga | `Σ carga × e^(−Δdias/τ) / 10 × 100`; τ 1,5 d (pequenos) / 2,0 d (grandes); grupo = porção mais fatigada |
| Check-in | (3 − nota) × 5 pts, só nos músculos que já têm fadiga |
| Janelas | metas = semana seg–dom · prontidão = 7 dias móveis · histórico de fadiga = 21 dias |
| Estados (%) | >75 Exausto · >50 Fadigado · >25 Recuperando · >10 Quase pronto · ≤10 Pronto |
| Mecânica | derivada (`joints > 1` = composto); nunca tag manual |
| Nome × grupo no import | o **nome** vale mais que o rótulo de grupo; no match aproximado o grupo só desempata |
| Sem vínculo | registro entra na fadiga por aproximação do grupo legado (`LEGACY_FALLBACK`) |

Todos os números (metas, τ, fatores de RIR, limites) estão em `DEFAULT_SETTINGS` / `GROUPS`: **editáveis**.

## Uso rápido

```js
import { buildCatalogIndex, importDiario, computeFatigue, fatigueBoxes,
         createStore, indexedDbBackend, todayLocal } from './src/index.js';

const index = buildCatalogIndex();
const store = createStore(indexedDbBackend());

const result = importDiario(JSON.parse(backupText), index, await store.getMappings());
await store.applyImport(result);              // idempotente
// result.pending → tela "vincular exercícios"; salve as escolhas com store.saveMappings()

const sessions = await store.sessionsSorted();
const boxes = fatigueBoxes(computeFatigue(sessions, index, todayLocal()));   // 7 boxes prontos
```

Rodar testes: `npm i && npm test`.

## Próximas fases
4 modo academia · 5 boxes/dashboard ligados a este núcleo · 6 assistente (gerador, próximo treino) · 7 gamificação · 8 offline/PWA.
