/**
 * Contrato da análise de refeição por imagem. Qualquer provedor (Claude, outro modelo, mock de teste)
 * implementa `MealAnalyzer`. O resultado é SEMPRE uma estimativa e passa por edição humana antes de ser gravado.
 */
export interface AnalyzedFood {
  name: string;
  estimated_grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Preparo presumido (grelhado, frito, cozido...). */
  preparation: string | null;
  /** 0–1: confiança na identificação/porção deste item. */
  confidence: number;
}

export interface MealAnalysis {
  foods: AnalyzedFood[];
  total: { calories: number; protein: number; carbs: number; fat: number };
  /** 0–1: confiança geral. */
  confidence: number;
  /** Premissas e fontes de incerteza (óleo, molho, itens escondidos, tamanho do prato). */
  assumptions: string[];
  /** Perguntas que, respondidas, melhoram a estimativa. */
  questions: string[];
  /** Avisos de consistência gerados pelo servidor (não pelo modelo). */
  warnings: string[];
  provider: string;
}

export interface MealAnalyzer {
  readonly name: string;
  analyzeMeal(image: Buffer, mime: 'image/jpeg' | 'image/png' | 'image/webp', context?: { hint?: string }): Promise<MealAnalysis>;
}

export class AnalyzerUnavailableError extends Error {
  statusCode = 503;
}
