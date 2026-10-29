# Forma — treino com intenção

Aplicação web em português para planejar treinos, registrar sessões, acompanhar volume e recuperação estimada e importar o histórico do Diário de Cargas. As recomendações são **estimativas educacionais**, não diagnóstico, tratamento ou garantia de resultado; procure orientação profissional em caso de dor, lesão ou dúvidas.

## GitHub Pages: versão local

A versão para Pages é uma exportação estática de Next.js. Ela não usa API nem PostgreSQL: dados e preferências ficam em IndexedDB, **somente no navegador e na origem em que foram criados**. Não há conta, senha ou sincronização entre dispositivos. Outra pessoa com acesso ao navegador pode vê-los; extensões e dados exportados também exigem cuidado.

O workflow `.github/workflows/pages.yml` constrói, testa e publica a versão estática. O endereço previsto para este repositório é <https://lucasrangel89.github.io/Forma/>. Para disponibilizá-lo, um administrador precisa abrir **Settings → Pages**, selecionar **GitHub Actions** como fonte e executar novamente o workflow `Publicar no GitHub Pages` se necessário. Consulte o resultado do job `deploy`: um build aprovado, sozinho, não garante que a página foi publicada.

### Começar e proteger seus dados

- No primeiro acesso há planejamento e registros de demonstração, identificados na interface. Em **Configurações → Meus dados**, é possível remover as sessões de exemplo sem apagar os treinos planejados ou sessões reais.
- Use **Exportar meus dados** periodicamente e antes de limpar o navegador ou trocar de dispositivo. O JSON não é criptografado: guarde-o em local seguro. **Restaurar backup** valida o arquivo e solicita confirmação antes de substituir os dados locais. A restauração aceita arquivos de até 10 MB.
- Limpar dados do navegador, usar navegação privada, esgotar o espaço ou mudar de origem/navegador pode impedir o acesso aos dados locais. A prévia local e o domínio do GitHub não compartilham automaticamente o mesmo banco.
- Após o carregamento, as gravações locais não exigem servidor. Isto **não é um PWA**: a abertura ou recarga sem conexão não é garantida. IndexedDB e criptografia do navegador exigem suporte do navegador e um contexto seguro (HTTPS ou localhost).
- Alterações entre abas da mesma origem são sinalizadas quando `BroadcastChannel` está disponível. Alterações simultâneas nas mesmas preferências podem prevalecer pela última gravação; não é uma solução de sincronização ou edição colaborativa.

O importador do Diário aceita até 500 sessões e 250 KB por arquivo, valida os dados antes de gravar e evita duplicar linhas já importadas, sem colapsar linhas idênticas que ocorram mais de uma vez no mesmo arquivo. Exercícios não reconhecidos podem ser vinculados manualmente ao catálogo. Um treino exportado do Forma pode ser importado pelo planejamento (limite de 250 KB). Backups completos são um formato separado, na aba **Meus dados**.

## Desenvolvimento e prévia estática

Requer Node.js 20.9 ou superior; o workflow usa Node 22.

```sh
npm ci
npm run build:pages
npm run serve:pages
# Abra http://localhost:4174/Forma/
```

O servidor de prévia serve `out/` e não é um servidor de produção. O caminho padrão do build é `/Forma`; se o repositório for renomeado, ajuste `NEXT_PUBLIC_BASE_PATH` no build, na prévia e no workflow. Por exemplo, para testar na raiz em shell POSIX:

```sh
NEXT_PUBLIC_BASE_PATH='' npm run build:pages
NEXT_PUBLIC_BASE_PATH='' npm run serve:pages
```

### Verificações

```sh
npm run lint
npm run typecheck
npm test               # testes do núcleo JS legado
npm run test:local     # motor TS e persistência IndexedDB simulada
npm run build:pages
npx playwright install --with-deps chromium  # uma vez, conforme seu sistema
npm run test:pages     # Chromium, fluxos estáticos e verificações automáticas axe
```

Os testes de Pages iniciam automaticamente a prévia em `http://127.0.0.1:4174/Forma/`. Para usar uma instância já iniciada, defina `PAGES_TEST_URL`. Os testes automatizados de acessibilidade detectam apenas parte dos problemas e **não estabelecem conformidade WCAG**.

**Atenção:** `tests/forma.spec.ts` é uma suíte antiga para o modo servidor e executa `TRUNCATE` no PostgreSQL configurado. Não a execute contra dados reais; use somente um banco descartável e isolado.

## Modo servidor existente

O modo Next.js com API e PostgreSQL permanece separado da exportação estática. Para usá-lo, configure `DATABASE_URL` no ambiente, prepare as tabelas conforme `src/db/schema.ts` e então execute `npm run dev` ou `npm run build && npm start`. `drizzle.config.json` contém uma configuração de desenvolvimento local; revise-a antes de qualquer operação no banco e nunca inclua segredos no Git.

Este modo identifica o perfil por cookie, **não oferece autenticação por conta/senha** e não deve ser tratado como solução de produção para dados sensíveis. A fila offline existente pode reenviar operações e duplicar registros em falhas ambíguas; reconciliação e idempotência no servidor precisam de revisão. Restauração do backup completo nesta versão está disponível apenas no modo local. Alterações no modo servidor não foram verificadas contra PostgreSQL nesta revisão.

## Organização e regras

- `src/components/`: telas, formulários e diálogos da aplicação.
- `src/lib/engine.ts`, `catalog.ts`, `importer.ts`: motor, catálogo e conversão usados pela aplicação web.
- `src/lib/local-store.ts`, `validation.ts`: persistência local transacional, validação e backups.
- `src/app/api/`, `src/db/`: API e armazenamento PostgreSQL do modo servidor.
- `src/*.js`, `test/`: núcleo JS legado e seus testes; seus modelos e algumas regras de agregação diferem dos módulos TypeScript da interface.

No motor web, séries concluídas que não são aquecimento e têm RIR vazio ou até 3 contam no volume efetivo; porções primárias e secundárias recebem seus pesos, com multiplicador indireto configurável. Os totais por grupo somam as contribuições das porções do grupo. Metas usam a semana calendário de segunda a domingo; outros indicadores usam os últimos sete dias. Fadiga e prontidão consideram até 21 dias com decaimento, e o estado do grupo usa a porção mais fatigada. O check-in ajusta apenas porções com fadiga calculada. Metas, escalas, fatores e constantes são editáveis e não são limites biológicos universais.

## Segurança de dependências

Verifique regularmente `npm audit` e atualize as dependências. Na auditoria realizada em 29/10/2026, `npm audit --omit=dev` não apontou vulnerabilidades; a árvore completa ainda apontou alertas moderados de `esbuild` transitivo de `drizzle-kit`, ferramenta de desenvolvimento. Não exponha servidores de desenvolvimento à internet e revise a atualização do kit antes de usá-lo em ambientes sensíveis.
