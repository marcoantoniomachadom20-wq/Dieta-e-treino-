# Integrações de dados de saúde

> **Fora do escopo por decisão do usuário.** A entrada manual dos dados do relógio (Dieta → Gasto) é a
> solução definitiva. Este documento fica só como registro, caso a decisão mude.

Hoje o gasto energético entra **manualmente** (Dieta → Gasto). A tabela `energy_logs` já tem a coluna
`source` e a rota `POST /api/energy` aceita os mesmos campos que uma integração enviaria.

Situação verificada em outubro/2026 — **confira a documentação oficial antes de implementar**, isso muda:

| Fonte | Como funciona | Viável para este projeto? |
|---|---|---|
| **Garmin Connect Developer Program** (Health/Activity API) | API de nuvem, mas o acesso exige aprovação e **não aceita uso pessoal**: só pessoa jurídica com site e política de privacidade públicos. Há relatos de pausa em novas aprovações. | ❌ Não para uso individual. |
| **Android Health Connect** | API **local no aparelho**, sem endpoint de nuvem. Só um app Android nativo com permissão do usuário lê os dados. | ⚠️ Só com um app Android acompanhante. |
| **Apple HealthKit** | Também **só no aparelho** (app iOS nativo com entitlement). Não existe API web. | ⚠️ Só com app iOS ou automação no iPhone. |

Fontes: [Garmin Health API](https://developer.garmin.com/gc-developer-program/health-api/),
[Garmin Developer Program Agreement](https://developerportal.garmin.com/sites/default/files/Garmin%20Connect%20Developer%20Program%20Agreement.pdf),
[Health Connect — arquitetura](https://developer.android.com/health-and-fitness/health-connect/architecture),
[Terra — pausa do programa Garmin](https://tryterra.co/blog/garmin-connect-developer-program-pause).

## Caminhos realistas, do mais simples ao mais trabalhoso

1. **Atalho do iPhone (Shortcuts)** — se usar iPhone: o app Garmin Connect sincroniza com o Apple Saúde; uma
   automação noturna do Atalhos lê "Energia ativa", "Energia em repouso" e "Passos" do dia e faz um POST JSON
   para o servidor. Precisa de um **token pessoal de API** (ainda não implementado: o próximo passo seria
   uma tabela `api_tokens` com hash, escopo "energy:write" e uma rota `POST /api/integrations/energy`).
2. **App Android acompanhante mínimo** (Capacitor/React Native/Kotlin) que lê Health Connect
   (Garmin Connect → Health Connect já sincroniza em muitos aparelhos) e envia para o mesmo endpoint com token.
3. **Importação de arquivo** — exportar atividades do Garmin Connect (CSV/FIT) e importar no app.
4. **API oficial Garmin** — só se o projeto virar um produto com empresa por trás.

Qualquer integração deve: gravar com `source` próprio (não sobrescrever o manual), ser idempotente por
`(user_id, date, source)` — a restrição UNIQUE já existe — e continuar tratando os valores como estimativas.
