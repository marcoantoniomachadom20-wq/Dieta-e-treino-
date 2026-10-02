# Performance — sistema pessoal de treino, nutrição e evolução

Painel pessoal que junta musculação, futvôlei, tênis, alimentação, gasto energético, peso, medidas,
fotos, recuperação e performance. Mobile-first, funciona como PWA ("Adicionar à tela inicial").

> O sistema organiza, calcula, estima e sugere. **Não é médico nem nutricionista.** Toda estimativa
> (calorias de foto, gasto, déficit, % de gordura) aparece como faixa e com nível de confiança.

## Rodando

Requisitos: Node 20+ (testado no 22).

```bash
npm install
cp .env.example .env          # opcional: ANTHROPIC_API_KEY para a foto da refeição
npm run dev                   # API em :3001 + frontend em :5173 (com proxy)
```

Abra http://localhost:5173 e crie a conta. Ela já nasce com:
- rotina: futvôlei seg/qua 19:30, tênis ter/qui 19:00, futvôlei "possível" sex 12:00;
- programa A (superior) / B (inferior) / C (equilibrado), 3x/semana;
- metas: 2.350 kcal, 160 g de proteína, 260 g de carboidrato, 70 g de gordura, água 35 ml/kg;
- metas de curto/médio/longo prazo e biblioteca com ~50 alimentos (valores aproximados TACO).

**Produção** (um processo serve API + frontend):

```bash
npm run build
NODE_ENV=production DATA_DIR=/caminho/persistente ANTHROPIC_API_KEY=... npm start
```

Precisa de **disco persistente** (VPS, Fly.io/Railway com volume, um Raspberry Pi em casa…). Não roda em
plataformas serverless sem disco (ex.: Vercel), porque usa SQLite e guarda fotos em arquivo. Coloque atrás
de HTTPS (Caddy/Nginx) — os cookies de sessão são `Secure` em produção.

## Testes

```bash
npm test            # unitários do domínio (core) + integração da API (Fastify inject, banco real temporário)
npm run typecheck
npm run e2e         # build + servidor temporário + Playwright em viewport de celular
```

O E2E cobre cadastro, check-in matinal, dashboard, registro alimentar, água, foto sem IA configurada,
gasto energético, treino completo (séries, RPE, conclusão), semana, histórico, peso, medidas, foto de
evolução, performance, relatório, metas, perfil, ausência de rolagem horizontal e persistência após reload.

## Backup

```bash
npm run backup                     # data/../backups/AAAA-MM-DDTHH-MM-SS (banco + fotos), mantém 14
BACKUP_DIR=/mnt/hd npm run backup
```

Usa a API de backup online do SQLite (seguro com o servidor rodando). Agende no cron, ex.:
`0 4 * * * cd /app && npm run backup`. Copie a pasta de backups para fora da máquina.
Exportação dos seus dados em JSON: Perfil → "Exportar tudo".

## Estrutura

```
packages/core   Lógica de domínio pura e testada: planejador semanal, nutrição, energia,
                recuperação, peso, performance, metas, insights, relatório semanal
apps/api        Fastify + SQLite (better-sqlite3): rotas, autenticação, serviços, IA, armazenamento de fotos
apps/web        React + Vite: telas mobile-first, gráficos (Recharts)
e2e             Teste ponta a ponta (Playwright)
docs            Arquitetura, decisões e integrações
```

Detalhes: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/DECISIONS.md](docs/DECISIONS.md) ·
[docs/INTEGRATIONS.md](docs/INTEGRATIONS.md)

## Status por fase

| Fase | Item | Status |
|---|---|---|
| 1 | Login, dashboard, treinos (hoje/semana/histórico), sessão com séries/carga/reps/RIR, RPE | ✅ |
| 1 | Dieta: biblioteca, registro manual, macros, calorias restantes, água, favoritas | ✅ |
| 1 | Peso com médias móveis e gráfico, recuperação/check-in | ✅ |
| 2 | Foto da refeição com IA (Claude), revisão obrigatória antes de gravar | ✅ (requer `ANTHROPIC_API_KEY`) |
| 2 | Fotos corporais privadas + comparação antes × agora | ✅ |
| 2 | Performance (cargas, PRs, esportes, carga semanal), relatório semanal, insights | ✅ |
| extra | Lista de compras, metas com progresso, gasto energético manual (Garmin), exportação | ✅ |
| 3 | Integração automática Garmin / Health Connect / Apple Health | ❌ ver [INTEGRATIONS](docs/INTEGRATIONS.md) |
| 3 | Notificações push, automações | ❌ |
