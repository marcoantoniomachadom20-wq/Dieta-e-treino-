# Decisões

## 1. Stack: React + Vite / Fastify / SQLite, monorepo npm workspaces
O repositório estava vazio. Escolha guiada por "simplicidade, sem overengineering, mobile-first":
- **SQLite** — um usuário, poucos MB por ano. Zero infraestrutura, backup = copiar um arquivo.
  Migrar para Postgres no futuro é viável (SQL simples, sem ORM).
- **Fastify** — leve, testes de integração rápidos com `inject` (sem subir porta).
- **React + Vite (SPA/PWA)** em vez de Next.js — não há SEO nem SSR a ganhar; um único processo Node serve
  tudo em produção.
- **Sem ORM** — SQL direto + zod. Menos mágica, consultas legíveis.
- **packages/core** separado — regra de negócio testável sem banco nem HTTP.
- Execução TypeScript com `tsx` também em produção: evita um passo de build no backend. Custo: alguns
  ms a mais no boot. Aceitável para uso pessoal.

## 2. Planejador de musculação: busca exaustiva com penalidades explícitas
Os esportes têm horário fixo; a musculação se encaixa em volta. Para cada combinação template → (dia, horário)
calcula-se uma penalidade (`packages/core/src/planner.ts`):
- pernas antes de esporte no mesmo dia: peso 5 × (carga de pernas do template) × (estresse de pernas do esporte);
- esporte no dia seguinte: 3×; dois dias depois: 1×; esporte no dia anterior: 0,8×;
- musculação em dias consecutivos: +1,5 (+2 se ambos com pernas);
- horário: após o esporte +1, fim de semana +1,5 (sáb) / +2,5 (dom);
- recuperação baixa no dia: +3 × carga total.
Pular uma sessão custa 8–10: o sistema prefere perder uma sessão a fazer pernas pesadas na véspera de jogo.

Estresse por esporte: futvôlei pernas 1,0 / superior 0,4; tênis 0,8 / 0,7. Sessão concluída com RPE alto
pesa mais (RPE/7, limitado a 0,6–1,4). Esporte "possível" pesa 0,5.

**Os números são heurísticos**, não ciência validada. Foram escolhidos para respeitar as regras do briefing
(testadas em `planner.test.ts`). Com a rotina padrão o resultado é: A segunda de manhã, C quinta após o tênis,
B sábado de manhã — porque **não existe dia útil sem esporte**. Se você não quer treinar no fim de semana,
desmarque o sábado em Perfil; o planejador vai colocar B na sexta após o futvôlei ou descartá-lo.

## 3. Recuperação: índice subjetivo, não "prontidão fisiológica"
Média ponderada das respostas 1–5 (sono 25%, horas de sono 15%, energia 20%, dor 20%, estresse 10%,
motivação 10%) → 0–100. ≥70 boa, 50–69 moderada, <50 baixa. Com ≥7 check-ins, cair 15+ pontos abaixo da
sua média rebaixa "boa" para "moderada". Não usamos HRV porque não há fonte de dados confiável ainda.

## 4. Energia: sempre faixa, nunca número exato
- Com calorias totais do relógio: ±15%, confiança média. Só ativas: TMB×1,15 + ativas, ±20%. Sem relógio:
  TMB×1,3 + METs das sessões, ±25%, confiança baixa.
- O balanço soma ±10% de erro no consumo registrado. Com menos de 2 refeições registradas o app **não mostra**
  déficit ("aguardando registros").
- A estimativa mais útil é a **manutenção adaptativa**: consumo médio − tendência do peso × 7.700 kcal/kg,
  exigindo ≥14 dias, ≥75% dos dias registrados e 8 pesagens.
- Nunca "queimou 800, pode comer 800": as calorias do relógio não alteram a meta.

## 5. Peso: decisão pela média
Média móvel de 7 dias por calendário, tendência por regressão linear em 28 dias (mínimo 6 pesagens em 10+ dias).
Insights de peso só aparecem com dados suficientes.

## 6. Progressão de carga: progressão dupla
Se todas as séries atingiram o topo da faixa com RIR ≥1, sugere +2,5 kg (superior) / +5 kg (pernas);
senão mantém. 1RM estimado por Epley, ignorado acima de 12 reps.

## 7. Carga de treino: session-RPE
RPE × minutos. Alerta quando os últimos 7 dias passam 130% da média das 3 semanas anteriores (com pelo menos
2 semanas de histórico). É um sinal de prudência, não um limite científico rígido — a literatura sobre
"ACWR" é controversa, por isso não exibimos a razão como se fosse risco de lesão.

## 8. IA da refeição: Claude com saída estruturada + pós-processamento próprio
- `MealAnalyzer` é uma interface; `AnthropicMealAnalyzer` é uma implementação. Trocar de provedor = nova classe.
- Saída validada por schema (zod) via structured outputs; fallback de recusa habilitado no servidor.
- O servidor **não confia na aritmética do modelo**: recalcula totais e corrige calorias incoerentes com 4/4/9,
  baixando a confiança.
- Sem `ANTHROPIC_API_KEY`, a função fica desativada com mensagem clara — **não há mock que invente comida**.
- Nada é gravado sem a revisão do usuário. O prompt pede premissas (óleo, molho, itens escondidos).
- Custo: cada foto é uma chamada ao modelo configurado (padrão `claude-opus-5-5`). Para baratear, defina
  `AI_MODEL=claude-sonnet-5-5`.

## 9. Fotos corporais: sem IA
O briefing proíbe estimar gordura por foto. A IA não é chamada para fotos corporais.

## 10. Relatório semanal e insights por regras, não por LLM
Texto gerado por regras a partir dos números (`core/report.ts`, `core/insights.ts`). Garante que o resumo
só afirma o que os dados sustentam, cada insight mostra a evidência usada e não há custo por relatório.

## 11. Sequência (streak)
Um dia conta se houve registro alimentar e nenhuma sessão obrigatória planejada ficou sem fazer. Descanso
planejado não quebra a sequência; "não consegui treinar" quebra. Hoje só conta depois de cumprido.
Há também a sequência de semanas batendo a meta de musculação.
