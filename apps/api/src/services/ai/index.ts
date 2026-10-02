import { config } from '../../config';
import { AnthropicMealAnalyzer } from './anthropic';
import { AnalyzerUnavailableError, type MealAnalyzer } from './types';

export * from './types';

/** Fábrica: sem chave configurada, a função de foto fica indisponível (sem dados inventados). */
export function createMealAnalyzer(): MealAnalyzer {
  if (!config.anthropicKey) {
    return {
      name: 'indisponivel',
      async analyzeMeal() {
        throw new AnalyzerUnavailableError('Análise por foto não configurada (defina ANTHROPIC_API_KEY no servidor). Registre manualmente.');
      },
    };
  }
  return new AnthropicMealAnalyzer(config.anthropicKey, config.aiModel);
}
