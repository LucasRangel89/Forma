# Forma — treino com intenção

Aplicação web em português para planejar treinos, registrar sessões, acompanhar volume e recuperação estimada e importar o histórico do Diário de Cargas. As recomendações são **estimativas educacionais**, não diagnóstico, tratamento ou garantia de resultado; procure orientação profissional em caso de dor, lesão ou dúvidas.

## GitHub Pages: versão local

A versão para Pages é uma exportação estática de Next.js. Ela não usa API nem PostgreSQL: dados e preferências ficam em IndexedDB, **somente no navegador e na origem em que foram criados**. Não há conta, senha ou sincronização entre dispositivos. Outra pessoa com acesso ao navegador pode vê-los; extensões e dados exportados também exigem cuidado.

O workflow `.github/workflows/pages.yml` constrói e testa a versão estática também em pull requests; a publicação ocorre apenas em execuções na `main`, não nas prévias de branches. O endereço previsto para este repositório é <https://lucasrangel89.github.io/Forma/>. Para disponibilizá-lo, um administrador precisa abrir **Settings → Pages**, selecionar **GitHub Actions** como fonte e executar novamente o workflow `Publicar no GitHub Pages` se necessário. Consulte o resultado do job `deploy`: um build aprovado, sozinho, não garante que a página foi publicada.

### Começar e proteger seus dados

- No primeiro acesso há planejamento e registros de demonstração, identificados na interface. Em **Configurações → Meus dados**, é possível remover as sessões de exemplo sem apagar os treinos planejados ou sessões reais.
- Use **Exportar meus dados** periodicamente e antes de limpar o navegador ou trocar de dispositivo. O JSON não é criptografado: guarde-o em local seguro. **Restaurar backup** valida o arquivo e solicita confirmação antes de substituir os dados locais. A restauração aceita arquivos de até 10 MB.
- Limpar dados do navegador, usar navegação privada, esgotar o espaço ou mudar de origem/navegador pode impedir o acesso aos dados locais. A prévia local e o domínio do GitHub não compartilham automaticamente o mesmo banco.
- Após o carregamento, as gravações locais não exigem servidor. Isto **não é um PWA**: a abertura ou recarga sem conexão não é garantida. IndexedDB e criptografia do navegador exigem suporte do navegador e um contexto seguro (HTTPS ou localhost).
- Alterações entre abas da mesma origem são sinalizadas quando `BroadcastChannel` está disponível. Alterações simultâneas nas mesmas preferências podem prevalecer pela última gravação; não é uma solução de sincronização ou edição colaborativa.

O importador do Diário aceita até 500 sessões e 250 KB por arquivo, valida os dados antes de gravar e evita duplicar linhas já importadas, sem colapsar linhas idênticas que ocorram mais de uma vez no mesmo arquivo. Exercícios não reconhecidos podem ser vinculados manualmente ao catálogo. Um treino exportado do Forma pode ser importado pelo planejamento (limite de 250 KB). Backups completos são um formato separado, na aba **Meus dados** e continuam na versão 1.

### Registrar, corrigir e acompanhar

- Em **Registrar treino**, escolha um plano ou **Registrar treino livre** para uma sessão avulsa, sem criar planejamento. Durante a sessão é possível adicionar/remover exercícios e até 20 séries por exercício, marcar aquecimentos e ajustar carga, repetições e RIR. Essas mudanças não alteram o plano. Só séries marcadas como concluídas são gravadas; aquecimentos concluídos aparecem no diário, mas não entram no volume efetivo nem na tonelagem.
- A carga inicial usa a última sessão real com séries de trabalho do mesmo exercício, quando existe; exemplos e aquecimentos não são usados. Confira cada carga antes de executar. O RIR começa vazio, mesmo quando o plano define uma meta, para não registrar um esforço presumido.
- Mudanças durante a sessão podem ser guardadas automaticamente em `sessionStorage`, **apenas na aba atual**. Use **Guardar rascunho** para sair e retomá-la; uma recarga na mesma aba também oferece recuperação. Fechar a aba, limpar dados ou armazenamento indisponível pode fazer o rascunho desaparecer. Ele **não está no backup**, não é sincronizado e não substitui **Finalizar e salvar**. O cronômetro pausa enquanto a sessão está fora da tela. Apenas um rascunho é mantido por aba, com confirmação antes de substituí-lo ou descartá-lo. Se um exercício não estiver mais no catálogo, escolha seu correspondente ao retomar, preservando as séries; se o plano tiver sido removido, a sessão é salva sem vínculo.
- No **Diário de treino**, abra uma sessão e escolha **Editar registro** para corrigir nome, data/hora, duração, notas, exercícios e séries. A edição preserva o identificador, o vínculo com o plano e a marcação de exemplo. Metadados antigos de RPE/falha são preservados; os cálculos web usam o RIR. Se outra aba alterar ou excluir o registro, uma edição ou exclusão baseada na versão antiga é bloqueada: copie suas alterações e reabra o registro.
- Em **Evolução → Força & progressão**, escolha exercício e período; exemplos ficam excluídos por padrão, com opção explícita para incluí-los. O gráfico mostra até 30 sessões e a tabela até 10; os cartões consideram todo o período filtrado. O e1RM usa a melhor série de trabalho concluída com carga externa maior que zero de cada sessão. Séries incompletas, aquecimentos e datas futuras ficam de fora; carga zero não representa o peso corporal total. Para uma repetição usa-se a própria carga e, para mais repetições, a fórmula de Epley, menos confiável com muitas reps.
- Ao registrar um plano, a dica de dupla progressão compara a prescrição atual com a última sessão **real daquele plano** que tenha séries de trabalho. Só sugere considerar aumentar a carga quando há pelo menos o número previsto de séries, todas atingiram o teto da faixa, com RIR registrado e suficiente e uma mesma carga externa positiva. Séries repetidas em blocos, cargas variadas, RIR ausente ou peso corporal exigem avaliação manual. O app nunca aumenta a carga automaticamente. Outros indicadores, como volume e recuperação, ainda incluem os exemplos enquanto eles existirem; o painel avisa sobre isso.

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

Para verificar a nova API e o fluxo de interface do modo servidor, prepare as tabelas de `src/db/schema.ts` em um PostgreSQL descartável, inicie o servidor apontando `DATABASE_URL` para esse banco e, em outro terminal, execute:

```sh
FORMA_TEST_DISPOSABLE=1 FORMA_TEST_SERVER_URL=http://localhost:3000 npm run test:server-api
FORMA_TEST_DISPOSABLE=1 PAGES_TEST_URL=http://localhost:3000/ npm run test:server-ui
```

Esses testes criam perfis e registros sintéticos e exigem a confirmação explícita de ambiente descartável; não os execute contra uma instância real. O teste de interface usa o Chromium do Playwright.

## Modo servidor existente

O modo Next.js com API e PostgreSQL permanece separado da exportação estática. Para usá-lo, configure `DATABASE_URL` no ambiente, prepare as tabelas conforme `src/db/schema.ts` e então execute `npm run dev` ou `npm run build && npm start`. `drizzle.config.json` contém uma configuração de desenvolvimento local; revise-a antes de qualquer operação no banco e nunca inclua segredos no Git.

Este modo identifica o perfil por cookie, **não oferece autenticação por conta/senha** e não deve ser tratado como solução de produção para dados sensíveis. Novos registros, correções e exclusões de sessões não entram mais na fila offline do servidor: em uma falha de rede ambígua, confira o diário antes de repetir, pois o servidor pode ter recebido a solicitação. Rascunhos podem ser mantidos na aba enquanto você verifica. A fila anterior e outras ações ainda precisam de revisão de reconciliação/idempotência. Restauração do backup completo nesta versão está disponível apenas no modo local. Os novos fluxos de API, concorrência de edição e interface foram testados em PostgreSQL 18 descartável; isso não substitui uma revisão de segurança ou testes de implantação.

## Organização e regras

- `src/components/`: telas, formulários e diálogos da aplicação.
- `src/lib/engine.ts`, `catalog.ts`, `importer.ts`: motor, catálogo e conversão usados pela aplicação web.
- `src/lib/local-store.ts`, `validation.ts`: persistência local transacional, validação e backups.
- `src/app/api/`, `src/db/`: API e armazenamento PostgreSQL do modo servidor.
- `src/*.js`, `test/`: núcleo JS legado e seus testes; seus modelos e algumas regras de agregação diferem dos módulos TypeScript da interface.

No motor web, séries concluídas que não são aquecimento e têm RIR vazio ou até 3 contam no volume efetivo; porções primárias e secundárias recebem seus pesos, com multiplicador indireto configurável. Os totais por grupo somam as contribuições das porções do grupo. Metas usam a semana calendário de segunda a domingo; outros indicadores usam os últimos sete dias. Fadiga e prontidão consideram até 21 dias com decaimento, e o estado do grupo usa a porção mais fatigada. O check-in ajusta apenas porções com fadiga calculada. Metas, escalas, fatores e constantes são editáveis e não são limites biológicos universais.

## Segurança de dependências

Verifique regularmente `npm audit` e atualize as dependências. Na auditoria realizada em 29/10/2026, `npm audit --omit=dev` não apontou vulnerabilidades; a árvore completa ainda apontou alertas moderados de `esbuild` transitivo de `drizzle-kit`, ferramenta de desenvolvimento. Não exponha servidores de desenvolvimento à internet e revise a atualização do kit antes de usá-lo em ambientes sensíveis.
