# Arquitetura

## Visão geral

```
 Celular (PWA)                        Servidor (um processo Node)
┌──────────────────┐  HTTPS/JSON   ┌───────────────────────────────────────────┐
│ apps/web (React) │ ────────────▶ │ apps/api (Fastify)                        │
│  páginas         │  cookie       │  routes/*   validação (zod) + auth        │
│  components/ui   │  httpOnly     │  services/  plan · metrics · recommend    │
│  lib/api, hooks  │               │  services/ai  MealAnalyzer (Claude)       │
└────────┬─────────┘               │  storage     fotos privadas em disco      │
         │ importa                 │  db          SQLite + migrações SQL       │
         ▼                         └──────────────┬────────────────────────────┘
┌──────────────────────────────────────────┐      │ importa
│ packages/core  (TypeScript puro, sem I/O)│ ◀────┘
│  nutrition · energy · recovery · weight  │
│  performance · planner · program         │
│  consistency · goals · insights · report │
└──────────────────────────────────────────┘
```

- **packages/core** concentra toda regra de negócio como funções puras. É a "camada de cálculo
  nutricional" e a "camada de cálculo de performance" pedidas no briefing, testada isoladamente
  (`packages/core/test`). O frontend também a importa (ex.: reescalar macros ao editar gramas da foto).
- **apps/api** faz I/O: banco, sessão, arquivos e IA. Rotas finas → serviços → core.
- **apps/web** só apresenta; não recalcula metas nem planejamento.

## Dados

SQLite (`data/app.db`), migrações em `apps/api/src/db/migrations/*.sql` aplicadas na inicialização.
Toda tabela de dados pessoais tem `user_id` — multiusuário é questão de liberar o cadastro.

| Tabela | Conteúdo |
|---|---|
| users, sessions | perfil, disponibilidade para musculação (JSON), sessões (hash do token) |
| nutrition_targets | metas com **vigência** (`effective_from`): aderência histórica usa a meta da época |
| schedule_template | rotina esportiva fixa da semana |
| workout_templates, template_exercises | programa A/B/C editável, com carga relativa de pernas/superior |
| workouts | sessões planejadas e realizadas (qualquer modalidade), RPE, duração, volume, status |
| workout_exercises, exercise_sets | exercícios da sessão e cada série (carga, reps, RIR, concluída) |
| planned_weeks | semanas cuja agenda já foi gerada |
| food_items, food_entries | biblioteca (por 100 g) e diário (macros "congelados" no registro) |
| favorite_meals, water_entries, meal_photos | refeições favoritas, água, fotos de refeição + JSON da análise |
| weight_entries, body_measurements, progress_photos | peso (1/dia), medidas, fotos corporais |
| recovery_checkins | check-in 1–5 + horas de sono, índice 0–100 e status |
| energy_logs | dados do relógio (hoje manuais; `source` preparado para integrações) |
| goals | metas curto/médio/longo prazo |

Diferenças em relação ao modelo do briefing (intencionais):
- `Exercise` virou `workout_exercises` + `exercise_sets`: o briefing pede registrar carga/reps/RIR **por série**.
- Peso fica em `weight_entries` (1 por dia) e as medidas em `body_measurements`; a tela junta os dois.
  Evita dois lugares para o mesmo número.
- `GarminData` virou `energy_logs` com `source`, para aceitar Garmin, Health Connect ou entrada manual.

## Fluxos principais

**Agenda da semana** — na primeira abertura da semana, `ensureWeekPlan` cria as sessões esportivas do
modelo e chama o planejador (`core/planner.ts`) para encaixar A/B/C. "Não consegui treinar" marca a sessão
como pulada e replaneja os dias restantes; sessões movidas à mão ficam travadas (`locked`).

**Treino** — iniciar copia o template, aplica o ajuste de prontidão (`sessionAdvice`: recuperação do dia,
esporte mais tarde/amanhã, salto de carga) e sugere cargas por progressão dupla com base na última sessão.
Cada série é salva na hora (atualização otimista). Concluir grava RPE, duração e volume.

**Foto da refeição** — o celular redimensiona e reencoda a imagem (remove EXIF/GPS) → `POST /api/meals/analyze`
grava a foto em área privada e chama `MealAnalyzer.analyzeMeal(image)` → o servidor recalcula totais e
checa coerência kcal × macros → o usuário revisa/corrige → só então `POST /api/meals/confirm` grava no diário.

## Segurança

- Senhas com scrypt; sessão = token aleatório em cookie `httpOnly`, `SameSite=Strict`, `Secure` em produção;
  no banco só o SHA-256 do token. Troca de senha derruba as outras sessões.
- Cadastro fechado após o primeiro usuário (`ALLOW_REGISTRATION` reabre).
- Limite de 5 tentativas de login por IP+e-mail a cada 15 min.
- CSRF: SameSite=Strict + verificação de `Origin` em toda mutação.
- Validação com zod em todas as entradas; consultas sempre filtradas por `user_id` (teste de isolamento).
- Fotos fora de pasta pública, nome aleatório, permissões 0600, servidas só por rota autenticada que confere
  o dono; tipo detectado pela assinatura do arquivo, limite de 10 MB.
- Cabeçalhos: CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`.
- `password_hash` nunca sai da API (há teste para isso).
- Backup consistente via `npm run backup`; exportação JSON pelo app.

Fora do escopo: 2FA (decisão do usuário), criptografia do banco em repouso (use disco criptografado no
servidor), rate limit global.
