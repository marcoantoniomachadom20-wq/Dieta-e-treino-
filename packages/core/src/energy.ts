import { round, linearSlope, mean, diffDays, type ISODate } from './dates';
import { bmrMifflin } from './nutrition';
import type { ActivityType, Confidence, Estimate, Sex } from './types';

/**
 * METs de referência (Compêndio de Atividades Físicas, valores aproximados).
 * Ajustados pelo RPE quando disponível. São estimativas grosseiras.
 */
const BASE_MET: Record<ActivityType, number> = {
  musculacao: 5.0,
  futevolei: 7.0,
  tenis: 7.3,
  recuperacao: 3.0,
  outro: 5.0,
};

export function estimateActivityKcal(type: ActivityType, minutes: number, weightKg: number, rpe?: number | null): number {
  let met = BASE_MET[type];
  if (rpe != null) met *= 0.7 + (Math.min(Math.max(rpe, 1), 10) / 10) * 0.6; // RPE 5 → 1.0×
  // Calorias LÍQUIDAS da atividade (descontando o gasto de repouso, 1 MET).
  return round(((met - 1) * 3.5 * weightKg * minutes) / 200);
}

export interface DeviceDay {
  total_calories?: number | null;
  active_calories?: number | null;
}

export interface SessionForEnergy {
  type: ActivityType;
  duration_min: number | null;
  rpe: number | null;
  calories: number | null;
}

/**
 * Gasto energético diário estimado.
 * 1) Se houver calorias totais do relógio: usa com faixa ±15% (confiança média).
 * 2) Se houver só ativas do relógio: TMB×1.15 + ativas, ±20%.
 * 3) Senão: TMB × 1.3 (vida diária) + estimativa por MET das sessões, ±25% (confiança baixa).
 */
export function estimateDailyExpenditure(p: {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  age: number;
  device?: DeviceDay | null;
  sessions: SessionForEnergy[];
}): Estimate {
  const bmr = bmrMifflin(p.sex, p.weightKg, p.heightCm, p.age);
  if (p.device?.total_calories && p.device.total_calories > bmr * 0.8) {
    const v = p.device.total_calories;
    return {
      value: round(v),
      low: round(v * 0.85),
      high: round(v * 1.15),
      confidence: 'media',
      method: 'Calorias totais informadas pelo relógio',
      notes: ['Relógios erram tipicamente 10–20% no gasto calórico, mais em esportes intermitentes.'],
    };
  }
  if (p.device?.active_calories != null && p.device.active_calories > 0) {
    const v = bmr * 1.15 + p.device.active_calories;
    return {
      value: round(v),
      low: round(v * 0.8),
      high: round(v * 1.2),
      confidence: 'baixa',
      method: 'TMB estimada + calorias ativas do relógio',
      notes: ['Sem calorias totais do relógio; base metabólica estimada por fórmula.'],
    };
  }
  const activity = p.sessions.reduce((acc, s) => {
    if (s.calories && s.calories > 0) return acc + s.calories;
    if (!s.duration_min) return acc;
    return acc + estimateActivityKcal(s.type, s.duration_min, p.weightKg, s.rpe);
  }, 0);
  const v = bmr * 1.3 + activity;
  return {
    value: round(v),
    low: round(v * 0.75),
    high: round(v * 1.25),
    confidence: 'baixa',
    method: 'Fórmula (TMB × 1,3) + estimativa das atividades registradas',
    notes: ['Sem dados do relógio. Use como referência grosseira, não como medida.'],
  };
}

export interface BalanceInput {
  intakeKcal: number;
  mealsLogged: number;
  dayClosed: boolean;
  expenditure: Estimate;
}

export interface EnergyBalance {
  intake: number;
  expenditure: Estimate;
  balance: number;
  balanceLow: number;
  balanceHigh: number;
  label: 'deficit' | 'superavit' | 'manutencao';
  confidence: Confidence;
  warnings: string[];
  /** Registro insuficiente: o número não deve ser exibido como déficit. */
  insufficient: boolean;
}

/** Balanço = consumo − gasto. Negativo = déficit. Sempre uma faixa, nunca um número exato. */
export function energyBalance(i: BalanceInput): EnergyBalance {
  const warnings: string[] = [];
  let confidence: Confidence = i.expenditure.confidence;
  if (i.mealsLogged < 2) {
    warnings.push('Poucas refeições registradas hoje — o consumo provavelmente está subestimado.');
    confidence = 'baixa';
  } else if (!i.dayClosed) {
    warnings.push('O dia ainda não terminou; o balanço vai mudar com as próximas refeições.');
  }
  const balance = round(i.intakeKcal - i.expenditure.value);
  // Erro do consumo registrado (~10%) somado ao erro do gasto.
  const intakeErr = i.intakeKcal * 0.1;
  const balanceLow = round(i.intakeKcal - intakeErr - i.expenditure.high);
  const balanceHigh = round(i.intakeKcal + intakeErr - i.expenditure.low);
  let label: EnergyBalance['label'] = 'manutencao';
  if (balanceHigh < 0) label = 'deficit';
  else if (balanceLow > 0) label = 'superavit';
  else if (balance < -150) label = 'deficit';
  else if (balance > 150) label = 'superavit';
  const insufficient = i.mealsLogged < 2;
  return { intake: round(i.intakeKcal), expenditure: i.expenditure, balance, balanceLow, balanceHigh, label, confidence, warnings, insufficient };
}

export interface AdaptiveDay {
  date: ISODate;
  intake: number | null;
  weight: number | null;
}

/**
 * Gasto de manutenção inferido pelos próprios dados: consumo médio − variação de peso × 7700 kcal/kg.
 * É a estimativa mais útil a médio prazo, mas exige ≥14 dias com boa adesão ao registro.
 * 7700 kcal/kg é uma aproximação (o conteúdo energético do tecido perdido varia).
 */
export function adaptiveMaintenance(days: AdaptiveDay[]): (Estimate & { daysUsed: number }) | null {
  if (days.length < 14) return null;
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const intakeDays = sorted.filter((d) => d.intake != null && d.intake > 800);
  const weights = sorted.filter((d) => d.weight != null);
  const span = diffDays(sorted[0].date, sorted[sorted.length - 1].date) + 1;
  if (intakeDays.length / span < 0.75 || weights.length < 8) return null;
  const slopePerDay = linearSlope(weights.map((w) => ({ x: diffDays(sorted[0].date, w.date), y: w.weight! })));
  if (slopePerDay == null) return null;
  const avgIntake = mean(intakeDays.map((d) => d.intake!))!;
  const v = avgIntake - slopePerDay * 7700;
  const confidence: Confidence = span >= 28 && intakeDays.length / span >= 0.85 ? 'media' : 'baixa';
  const spread = confidence === 'media' ? 0.1 : 0.15;
  return {
    value: round(v, -1),
    low: round(v * (1 - spread), -1),
    high: round(v * (1 + spread), -1),
    confidence,
    method: `Consumo médio registrado (${round(avgIntake)} kcal) ajustado pela tendência do peso em ${span} dias`,
    notes: [
      'Depende de registrar tudo que come. Dias sem registro foram ignorados.',
      'Retenção hídrica pode distorcer a tendência em janelas curtas.',
    ],
    daysUsed: span,
  };
}
