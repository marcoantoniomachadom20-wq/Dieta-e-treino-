import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import * as z from 'zod/v4';
import type { MealAnalyzer } from './types';
import { finalizeAnalysis } from './finalize';

const FoodSchema = z.object({
  name: z.string().describe('Nome do alimento em português do Brasil'),
  estimated_grams: z.number().describe('Peso estimado da porção em gramas (já preparado)'),
  calories: z.number(),
  protein: z.number().describe('gramas'),
  carbs: z.number().describe('gramas'),
  fat: z.number().describe('gramas'),
  preparation: z.string().nullable().describe('Preparo presumido, ex.: grelhado, frito, cozido'),
  confidence: z.number().describe('0 a 1: confiança na identificação e na porção deste item'),
});

const AnalysisSchema = z.object({
  is_food: z.boolean().describe('false se a imagem não mostra comida'),
  foods: z.array(FoodSchema),
  confidence: z.number().describe('0 a 1: confiança geral da estimativa'),
  assumptions: z.array(z.string()).describe('Premissas e fontes de incerteza, ex.: óleo do preparo, molho, itens escondidos'),
  questions: z.array(z.string()).describe('Até 3 perguntas curtas que melhorariam a estimativa'),
});

const SYSTEM = `Você estima a composição nutricional de refeições a partir de fotos para um app pessoal de dieta no Brasil.
Regras:
- Identifique cada alimento visível separadamente. Use nomes comuns no Brasil (ex.: "Arroz branco cozido", "Feijão carioca").
- Estime gramas do alimento PRONTO, usando referências visuais (prato ~26 cm, talheres, mãos). Prefira valores redondos (múltiplos de 10 g).
- Calcule macros com valores de referência da Tabela TACO quando aplicável. Calorias devem ser coerentes com 4/4/9 kcal por g de proteína/carboidrato/gordura.
- Seja honesto sobre incerteza: óleo de preparo, manteiga, molhos, açúcar e itens cobertos raramente são visíveis. Liste essas premissas.
- Se o preparo provavelmente usou óleo/gordura que não aparece, inclua isso nas premissas e já considere uma quantidade moderada no item correspondente.
- Nunca afirme precisão que não existe. Confiança geral acima de 0.85 só para pratos simples e bem visíveis.
- Se a imagem não for de comida, retorne is_food=false e foods vazio.`;

export class AnthropicMealAnalyzer implements MealAnalyzer {
  readonly name: string;
  private client: Anthropic;

  constructor(apiKey: string | undefined, private model: string) {
    this.client = new Anthropic(apiKey ? { apiKey } : {});
    this.name = `anthropic:${model}`;
  }

  async analyzeMeal(image: Buffer, mime: 'image/jpeg' | 'image/png' | 'image/webp', context?: { hint?: string }) {
    const response = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 16000,
      // Recusas por classificador de segurança são re-executadas no modelo de fallback recomendado.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(AnalysisSchema) },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mime, data: image.toString('base64') } },
            {
              type: 'text',
              text: context?.hint
                ? `Analise esta refeição. Informação do usuário: ${context.hint.slice(0, 300)}`
                : 'Analise esta refeição.',
            },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      throw Object.assign(new Error('A análise foi recusada pelo modelo. Registre a refeição manualmente.'), { statusCode: 422 });
    }
    const parsed = response.parsed_output;
    if (!parsed) throw Object.assign(new Error('Resposta da IA em formato inesperado. Tente novamente.'), { statusCode: 502 });
    if (!parsed.is_food) throw Object.assign(new Error('Não identifiquei comida na foto.'), { statusCode: 422 });

    return finalizeAnalysis({ ...parsed, provider: `${this.name} (${response.model})` });
  }
}
