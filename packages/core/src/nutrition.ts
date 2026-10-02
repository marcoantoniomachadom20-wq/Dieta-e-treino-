import { round } from './dates';
import type { Macros, NutritionTargets, Sex } from './types';

/** Macros por 100 g (ou 100 ml) de um alimento. */
export interface FoodPer100 {
  kcal_100: number;
  protein_100: number;
  carbs_100: number;
  fat_100: number;
}

export const ZERO_MACROS: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0 };

/** Escala valores por 100 g para uma quantidade em gramas. */
export function scaleFood(food: FoodPer100, grams: number): Macros {
  const f = grams / 100;
  return {
    calories: round(food.kcal_100 * f, 0),
    protein: round(food.protein_100 * f, 1),
    carbs: round(food.carbs_100 * f, 1),
    fat: round(food.fat_100 * f, 1),
  };
}

/** Reescala macros já calculados de uma porção para outra (ex.: corrigir gramas estimadas pela IA). */
export function rescale(m: Macros, fromGrams: number, toGrams: number): Macros {
  if (fromGrams <= 0) return { ...m };
  return scaleFood(
    {
      kcal_100: (m.calories / fromGrams) * 100,
      protein_100: (m.protein / fromGrams) * 100,
      carbs_100: (m.carbs / fromGrams) * 100,
      fat_100: (m.fat / fromGrams) * 100,
    },
    toGrams,
  );
}

export function sumMacros(items: Macros[]): Macros {
  const t = items.reduce(
    (acc, m) => ({
      calories: acc.calories + (m.calories || 0),
      protein: acc.protein + (m.protein || 0),
      carbs: acc.carbs + (m.carbs || 0),
      fat: acc.fat + (m.fat || 0),
    }),
    { ...ZERO_MACROS },
  );
  return { calories: round(t.calories), protein: round(t.protein, 1), carbs: round(t.carbs, 1), fat: round(t.fat, 1) };
}

export interface MacroProgress {
  consumed: number;
  target: number;
  remaining: number;
  pct: number;
  over: boolean;
}

function progress(consumed: number, target: number): MacroProgress {
  const remaining = round(target - consumed, 1);
  return {
    consumed: round(consumed, 1),
    target,
    remaining,
    pct: target > 0 ? round((consumed / target) * 100) : 0,
    over: remaining < 0,
  };
}

export function dailyProgress(consumed: Macros, target: Macros) {
  return {
    calories: progress(consumed.calories, target.calories),
    protein: progress(consumed.protein, target.protein),
    carbs: progress(consumed.carbs, target.carbs),
    fat: progress(consumed.fat, target.fat),
  };
}

/**
 * Verifica se as calorias declaradas batem com 4/4/9 kcal por g de P/C/G.
 * Divergências grandes indicam erro de digitação ou estimativa da IA inconsistente.
 */
export function macroCalorieCheck(m: Macros): { expected: number; diffPct: number; consistent: boolean } {
  const expected = m.protein * 4 + m.carbs * 4 + m.fat * 9;
  if (m.calories <= 0 && expected <= 0) return { expected: 0, diffPct: 0, consistent: true };
  const base = Math.max(m.calories, 1);
  const diffPct = round((Math.abs(expected - m.calories) / base) * 100);
  // Fibras, álcool e arredondamentos de rótulo justificam alguma folga.
  return { expected: round(expected), diffPct, consistent: diffPct <= 20 || Math.abs(expected - m.calories) < 25 };
}

/** Taxa metabólica basal estimada (Mifflin-St Jeor). É uma estimativa populacional (erro típico ±10%). */
export function bmrMifflin(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return round(sex === 'masculino' ? base + 5 : base - 161);
}

/**
 * Sugestão de metas para recomposição/redução de gordura em praticante de esportes.
 * Retorna faixas — o usuário decide o número. Não é prescrição.
 */
export function suggestTargets(p: {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  age: number;
  activityFactor?: number;
  deficitKcal?: number;
}) {
  const bmr = bmrMifflin(p.sex, p.weightKg, p.heightCm, p.age);
  const factor = p.activityFactor ?? 1.6;
  const maintenance = round(bmr * factor, -1);
  const deficit = p.deficitKcal ?? 450;
  const calories = round(maintenance - deficit, -1);
  const protein = { low: round(p.weightKg * 1.8), high: round(p.weightKg * 2.2) };
  const fat = { low: round(p.weightKg * 0.7), high: round(p.weightKg * 1.0) };
  const proteinMid = round((protein.low + protein.high) / 2);
  const fatMid = round((fat.low + fat.high) / 2);
  const carbs = Math.max(0, round((calories - proteinMid * 4 - fatMid * 9) / 4));
  return {
    bmr,
    maintenance: { value: maintenance, low: round(maintenance * 0.88, -1), high: round(maintenance * 1.12, -1) },
    calories,
    protein,
    fat,
    carbs,
    notes: [
      'Manutenção estimada = TMB (Mifflin-St Jeor) × fator de atividade. Erro típico de ±10–15%.',
      'Ajuste pela tendência do peso médio após 2–3 semanas, não pelo número do dia.',
    ],
  };
}

export function defaultWaterMl(weightKg: number): number {
  return round(weightKg * 35, -2);
}

export function isTargetsValid(t: NutritionTargets): boolean {
  return t.calories > 800 && t.calories < 6000 && t.protein > 0 && t.protein < 400 && t.carbs >= 0 && t.fat > 0;
}
