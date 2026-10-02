import { macroCalorieCheck, round, sumMacros } from '@app/core';
import type { AnalyzedFood, MealAnalysis } from './types';

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));

/**
 * Pós-processamento independente do provedor: não confiamos na aritmética do modelo.
 * - Remove itens inválidos, arredonda e limita valores.
 * - Recalcula o total a partir dos itens.
 * - Sinaliza itens cujas calorias não batem com os macros.
 */
export function finalizeAnalysis(raw: {
  foods: AnalyzedFood[];
  confidence: number;
  assumptions: string[];
  questions: string[];
  provider: string;
}): MealAnalysis {
  const warnings: string[] = [];
  const foods = raw.foods
    .filter((f) => f.name && f.estimated_grams > 0 && f.estimated_grams < 3000)
    .map((f) => {
      const item = {
        name: f.name.trim().slice(0, 120),
        estimated_grams: round(f.estimated_grams),
        calories: round(Math.max(0, f.calories)),
        protein: round(Math.max(0, f.protein), 1),
        carbs: round(Math.max(0, f.carbs), 1),
        fat: round(Math.max(0, f.fat), 1),
        preparation: f.preparation ?? null,
        confidence: round(clamp01(f.confidence), 2),
      };
      const check = macroCalorieCheck(item);
      if (!check.consistent) {
        warnings.push(`${item.name}: calorias (${item.calories}) não batem com os macros (~${check.expected} kcal). Ajustado pelos macros.`);
        item.calories = check.expected;
      }
      return item;
    });
  if (foods.length < raw.foods.length) warnings.push('Alguns itens com valores inválidos foram descartados.');
  const total = sumMacros(foods);
  let confidence = clamp01(raw.confidence);
  if (warnings.length) confidence = Math.min(confidence, 0.6);
  return {
    foods,
    total,
    confidence: round(confidence, 2),
    assumptions: raw.assumptions.slice(0, 8),
    questions: raw.questions.slice(0, 3),
    warnings,
    provider: raw.provider,
  };
}
