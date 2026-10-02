import { round } from './dates';

export interface WeeklyReportInput {
  weekStart: string;
  weekEnd: string;
  avgWeight: number | null;
  prevAvgWeight: number | null;
  weighIns: number;
  avgCalories: number | null;
  avgProtein: number | null;
  calorieTarget: number;
  proteinTarget: number;
  daysLogged: number;
  /** dias com calorias dentro de ±10% da meta e proteína ≥ 90% */
  daysOnTarget: number;
  lifts: { done: number; planned: number };
  futevolei: { done: number; planned: number };
  tenis: { done: number; planned: number };
  liftVolume: number;
  prevLiftVolume: number | null;
  avgRecovery: number | null;
  avgSleep: number | null;
  strengthTrend: 'subindo' | 'estavel' | 'caindo' | null;
  prs: { exercise: string; weight: number; reps: number }[];
  skipped: number;
}

export function buildWeeklyReport(i: WeeklyReportInput) {
  const weightChange = i.avgWeight != null && i.prevAvgWeight != null ? round(i.avgWeight - i.prevAvgWeight, 1) : null;
  const plannedTotal = i.lifts.planned + i.futevolei.planned + i.tenis.planned;
  const doneTotal = i.lifts.done + i.futevolei.done + i.tenis.done;
  const trainingAdherence = plannedTotal > 0 ? round((Math.min(doneTotal, plannedTotal) / plannedTotal) * 100) : null;
  const dietAdherence = round((i.daysOnTarget / 7) * 100);
  const recoveryLabel = i.avgRecovery == null ? null : i.avgRecovery >= 70 ? 'boa' : i.avgRecovery >= 50 ? 'moderada' : 'baixa';
  const performance = i.strengthTrend === 'subindo' ? '↑' : i.strengthTrend === 'caindo' ? '↓' : i.strengthTrend === 'estavel' ? '→' : '–';

  const attention: string[] = [];
  if (i.weighIns < 3) attention.push('Poucas pesagens (menos de 3): a média de peso da semana é pouco confiável.');
  if (i.daysLogged < 5) attention.push(`Alimentação registrada em ${i.daysLogged}/7 dias — médias de consumo podem estar distorcidas.`);
  if (i.avgProtein != null && i.avgProtein < i.proteinTarget * 0.9) attention.push(`Proteína média ${round(i.avgProtein)} g, abaixo da meta de ${i.proteinTarget} g.`);
  if (i.lifts.done < i.lifts.planned) attention.push(`Musculação: ${i.lifts.done}/${i.lifts.planned} sessões.`);
  if (recoveryLabel === 'baixa') attention.push('Recuperação média baixa na semana.');
  if (i.avgSleep != null && i.avgSleep < 7) attention.push(`Sono médio de ${round(i.avgSleep, 1)} h.`);
  if (weightChange != null && i.avgWeight && weightChange / i.avgWeight < -0.012) attention.push('Queda de peso acima de ~1,2% em uma semana — parte disso tende a ser água, mas observe.');

  // Resumo em linguagem simples, apenas com o que os dados sustentam.
  const parts: string[] = [];
  if (trainingAdherence != null) {
    parts.push(trainingAdherence >= 90 ? 'semana consistente nos treinos' : trainingAdherence >= 60 ? 'frequência de treino parcial' : 'semana com poucos treinos realizados');
  }
  if (weightChange != null && i.weighIns >= 3) {
    if (weightChange <= -0.2) parts.push(`redução ${weightChange <= -0.8 ? 'acentuada' : 'moderada'} do peso médio`);
    else if (weightChange >= 0.2) parts.push('aumento do peso médio');
    else parts.push('peso médio estável');
  }
  if (i.daysLogged >= 5) parts.push(dietAdherence >= 70 ? 'boa aderência à dieta' : 'aderência à dieta abaixo do ideal');
  if (i.prs.length) parts.push(`${i.prs.length} recorde(s) pessoal(is)`);
  const summary = parts.length ? parts[0].charAt(0).toUpperCase() + parts.join(', ').slice(1) + '.' : 'Dados insuficientes para um resumo nesta semana.';

  return {
    weekStart: i.weekStart,
    weekEnd: i.weekEnd,
    weight: { avg: i.avgWeight, prevAvg: i.prevAvgWeight, change: weightChange, weighIns: i.weighIns },
    nutrition: {
      avgCalories: i.avgCalories != null ? round(i.avgCalories) : null,
      avgProtein: i.avgProtein != null ? round(i.avgProtein) : null,
      calorieTarget: i.calorieTarget,
      proteinTarget: i.proteinTarget,
      daysLogged: i.daysLogged,
      dietAdherence,
    },
    training: {
      lifts: i.lifts,
      futevolei: i.futevolei,
      tenis: i.tenis,
      liftVolume: i.liftVolume,
      prevLiftVolume: i.prevLiftVolume,
      adherence: trainingAdherence,
      skipped: i.skipped,
    },
    recovery: { avg: i.avgRecovery != null ? round(i.avgRecovery) : null, label: recoveryLabel, avgSleep: i.avgSleep != null ? round(i.avgSleep, 1) : null },
    performance: { arrow: performance, trend: i.strengthTrend, prs: i.prs },
    attention,
    summary,
    definitions: {
      dietAdherence: 'Dias com calorias dentro de ±10% da meta e proteína ≥ 90% da meta, sobre 7.',
      weight: 'Média das pesagens da semana comparada à média da semana anterior.',
    },
  };
}

export type WeeklyReport = ReturnType<typeof buildWeeklyReport>;
