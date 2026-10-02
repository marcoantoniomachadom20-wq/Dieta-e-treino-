import type { ISODate } from './dates';

export type Sex = 'masculino' | 'feminino';

export type ActivityType = 'musculacao' | 'futevolei' | 'tenis' | 'recuperacao' | 'outro';

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  musculacao: 'Musculação',
  futevolei: 'Futvôlei',
  tenis: 'Tênis',
  recuperacao: 'Recuperação ativa',
  outro: 'Outra atividade',
};

export type WorkoutStatus = 'planejado' | 'em_andamento' | 'concluido' | 'pulado';

export type MealType =
  | 'cafe_da_manha'
  | 'lanche_manha'
  | 'almoco'
  | 'lanche_tarde'
  | 'pre_treino'
  | 'jantar'
  | 'ceia'
  | 'livre';

export const MEALS: { id: MealType; label: string }[] = [
  { id: 'cafe_da_manha', label: 'Café da manhã' },
  { id: 'lanche_manha', label: 'Lanche da manhã' },
  { id: 'almoco', label: 'Almoço' },
  { id: 'lanche_tarde', label: 'Lanche da tarde' },
  { id: 'pre_treino', label: 'Pré-treino' },
  { id: 'jantar', label: 'Jantar' },
  { id: 'ceia', label: 'Ceia' },
  { id: 'livre', label: 'Livre' },
];

export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface NutritionTargets extends Macros {
  water_ml: number;
}

export type Confidence = 'baixa' | 'media' | 'alta';

export interface Estimate {
  value: number;
  low: number;
  high: number;
  confidence: Confidence;
  method: string;
  notes: string[];
}

export interface DatedValue {
  date: ISODate;
  value: number;
}
