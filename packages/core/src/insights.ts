import { round } from './dates';

/**
 * Motor de recomendações baseado em regras explícitas.
 * Cada insight carrega a evidência usada — nada de conclusões que os dados não sustentam.
 * Nunca diagnóstico médico.
 */
export type InsightLevel = 'info' | 'atencao' | 'positivo';

export interface Insight {
  id: string;
  level: InsightLevel;
  title: string;
  message: string;
  evidence: string[];
}

export interface InsightInput {
  goal: 'perda_gordura' | 'recomposicao' | 'ganho_massa' | 'manutencao';
  /** taxa de variação de peso (regressão 28 dias) */
  weightRate: { kgPerWeek: number; pctPerWeek: number; points: number } | null;
  /** taxa nos 14 dias anteriores à janela atual (para saber se é persistente) */
  previousWeightRate: { kgPerWeek: number; pctPerWeek: number } | null;
  strengthTrend: 'subindo' | 'estavel' | 'caindo' | null;
  avgProtein7d: number | null;
  proteinTarget: number;
  avgCalories7d: number | null;
  calorieTarget: number;
  daysFoodLogged7d: number;
  avgRecoveryScore3d: number | null;
  avgSleepHours7d: number | null;
  loadTrend: { label: 'sem_base' | 'baixa' | 'estavel' | 'alta'; ratio: number | null };
  liftsThisWeek: number;
  liftTarget: number;
  daysLeftInWeek: number;
  avgSportRpe14d?: number | null;
}

export function generateInsights(i: InsightInput): Insight[] {
  const out: Insight[] = [];
  const fatLoss = i.goal === 'perda_gordura' || i.goal === 'recomposicao';

  if (i.daysFoodLogged7d < 5) {
    out.push({
      id: 'registro_baixo',
      level: 'info',
      title: 'Registro alimentar incompleto',
      message: 'Com menos de 5 dias registrados na semana, médias de calorias e o balanço energético ficam pouco confiáveis.',
      evidence: [`${i.daysFoodLogged7d}/7 dias com registro`],
    });
  }

  if (i.weightRate && fatLoss) {
    const r = i.weightRate;
    const persistent = i.previousWeightRate != null && i.previousWeightRate.pctPerWeek <= -1;
    if (r.pctPerWeek <= -1 && i.strengthTrend === 'caindo') {
      out.push({
        id: 'perda_rapida_performance',
        level: 'atencao',
        title: 'Perda acelerada com queda de performance',
        message: 'Sua perda de peso está acelerada e sua força caiu. Considere revisar o déficit energético (ex.: +150–250 kcal/dia, de preferência em carboidratos perto dos treinos).',
        evidence: [`${r.kgPerWeek} kg/semana (${r.pctPerWeek}%/sem)`, 'Tendência de força: caindo'],
      });
    } else if (r.pctPerWeek <= -1 && persistent) {
      out.push({
        id: 'perda_rapida',
        level: 'atencao',
        title: 'Ritmo de perda alto por várias semanas',
        message: 'Acima de ~1% do peso por semana de forma sustentada aumenta o risco de perder massa magra e performance. Vale observar força e recuperação de perto.',
        evidence: [`Últimas 4 semanas: ${r.pctPerWeek}%/sem`, `Janela anterior: ${i.previousWeightRate!.pctPerWeek}%/sem`],
      });
    } else if (Math.abs(r.pctPerWeek) < 0.15 && r.points >= 10) {
      out.push({
        id: 'peso_estavel',
        level: 'info',
        title: 'Peso médio estável',
        message:
          i.goal === 'recomposicao'
            ? 'Peso estável. Em recomposição isso pode ser esperado — acompanhe cintura e cargas para saber se está funcionando.'
            : 'Seu peso médio está estável. Caso o objetivo continue sendo redução de gordura, pode ser necessário revisar a ingestão calórica ou o nível de atividade — confira antes se o registro alimentar está completo.',
        evidence: [`${r.kgPerWeek} kg/semana em ${r.points} pesagens`],
      });
    } else if (r.pctPerWeek > 0.25) {
      out.push({
        id: 'peso_subindo',
        level: 'atencao',
        title: 'Peso médio subindo',
        message: 'A tendência é de ganho, contrária ao objetivo de reduzir gordura. Verifique se o consumo registrado está batendo com a meta.',
        evidence: [`+${r.kgPerWeek} kg/semana`],
      });
    } else if (r.pctPerWeek <= -0.3 && r.pctPerWeek > -1 && i.strengthTrend !== 'caindo') {
      out.push({
        id: 'ritmo_bom',
        level: 'positivo',
        title: 'Ritmo de perda sustentável',
        message: 'Peso caindo em ritmo moderado sem queda de força. Mantenha o plano.',
        evidence: [`${r.kgPerWeek} kg/semana (${r.pctPerWeek}%/sem)`, `Força: ${i.strengthTrend ?? 'sem dados suficientes'}`],
      });
    }
  }

  if (i.avgProtein7d != null && i.daysFoodLogged7d >= 4 && i.avgProtein7d < i.proteinTarget * 0.9) {
    out.push({
      id: 'proteina_baixa',
      level: 'atencao',
      title: 'Proteína abaixo da meta',
      message: `Faltam em média ${round(i.proteinTarget - i.avgProtein7d)} g/dia. Em déficit, proteína adequada ajuda a preservar massa muscular. Uma porção extra de fonte magra por dia costuma resolver.`,
      evidence: [`Média: ${round(i.avgProtein7d)} g`, `Meta: ${i.proteinTarget} g`],
    });
  }

  if (i.avgRecoveryScore3d != null && i.avgRecoveryScore3d < 50) {
    out.push({
      id: 'recuperacao_baixa',
      level: 'atencao',
      title: 'Recuperação baixa nos últimos dias',
      message: 'Considere reduzir o volume da musculação e priorizar sono. Se a sensação persistir por semanas, procure um profissional.',
      evidence: [`Índice médio (3 dias): ${round(i.avgRecoveryScore3d)}/100`],
    });
  }

  if (i.avgSleepHours7d != null && i.avgSleepHours7d < 7) {
    out.push({
      id: 'sono_curto',
      level: 'info',
      title: 'Sono abaixo de 7 h',
      message: 'Sono curto prejudica recuperação, controle de fome e performance. É a alavanca mais barata do sistema.',
      evidence: [`Média 7 dias: ${round(i.avgSleepHours7d, 1)} h`],
    });
  }

  if (i.loadTrend.label === 'alta' && i.loadTrend.ratio) {
    out.push({
      id: 'carga_alta',
      level: 'atencao',
      title: 'Salto de carga de treino',
      message: 'A carga dos últimos 7 dias está bem acima da sua média recente. Aumentos bruscos costumam vir junto com mais fadiga — avalie reduzir o volume da musculação.',
      evidence: [`${round(i.loadTrend.ratio * 100)}% da média das 3 semanas anteriores (RPE × minutos)`],
    });
  }

  const missing = i.liftTarget - i.liftsThisWeek;
  if (missing > 0 && missing > i.daysLeftInWeek) {
    out.push({
      id: 'meta_musculacao',
      level: 'info',
      title: 'Meta semanal de musculação fora de alcance',
      message: 'Não há dias suficientes para completar a meta sem empilhar treinos. Melhor fazer bem as sessões restantes do que compensar.',
      evidence: [`${i.liftsThisWeek}/${i.liftTarget} feitos, ${i.daysLeftInWeek} dia(s) restantes`],
    });
  }

  if (i.strengthTrend === 'subindo') {
    out.push({
      id: 'forca_subindo',
      level: 'positivo',
      title: 'Força em alta',
      message: 'Suas cargas estimadas subiram nas últimas 2 semanas.',
      evidence: ['Comparação do melhor 1RM estimado: últimas 2 semanas × 4 anteriores'],
    });
  }

  return out;
}
