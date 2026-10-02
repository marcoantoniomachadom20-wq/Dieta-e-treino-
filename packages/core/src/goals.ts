import { round } from './dates';

export type GoalHorizon = 'curto' | 'medio' | 'longo';

export type GoalKind =
  | 'musculacao_semana' // sessões de musculação na semana atual
  | 'proteina_semana' // dias na semana com proteína ≥ 90% da meta
  | 'registro_semana' // dias na semana com alimentação registrada
  | 'sono_semana' // média de horas de sono na semana
  | 'peso_alvo' // média de 7 dias até um alvo
  | 'cintura_alvo' // cintura (cm) até um alvo
  | 'carga_exercicio' // carga máxima em um exercício
  | 'treinos_mes' // sessões totais (todas as modalidades) no mês
  | 'manual'; // progresso informado manualmente

export const GOAL_KIND_LABEL: Record<GoalKind, string> = {
  musculacao_semana: 'Musculação na semana',
  proteina_semana: 'Dias batendo proteína',
  registro_semana: 'Dias com alimentação registrada',
  sono_semana: 'Média de sono (h)',
  peso_alvo: 'Peso (média 7 dias)',
  cintura_alvo: 'Cintura (cm)',
  carga_exercicio: 'Carga em exercício (kg)',
  treinos_mes: 'Treinos no mês',
  manual: 'Manual',
};

export interface GoalDef {
  kind: GoalKind;
  target_value: number;
  start_value: number | null;
  current_manual?: number | null;
}

/**
 * Progresso em %. Para metas de "reduzir" (peso, cintura), o progresso é
 * (início − atual) / (início − alvo). Limitado a 0–100.
 */
export function goalProgress(g: GoalDef, current: number | null): { current: number | null; pct: number } {
  const cur = g.kind === 'manual' ? g.current_manual ?? null : current;
  if (cur == null) return { current: null, pct: 0 };
  if (g.start_value != null && (g.kind === 'peso_alvo' || g.kind === 'cintura_alvo' || g.kind === 'carga_exercicio')) {
    const span = g.target_value - g.start_value;
    if (span === 0) return { current: cur, pct: 100 };
    const pct = ((cur - g.start_value) / span) * 100;
    return { current: cur, pct: round(Math.min(100, Math.max(0, pct))) };
  }
  if (g.target_value <= 0) return { current: cur, pct: 0 };
  return { current: cur, pct: round(Math.min(100, Math.max(0, (cur / g.target_value) * 100))) };
}
