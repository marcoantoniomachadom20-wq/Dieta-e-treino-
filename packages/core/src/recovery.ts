import { round, mean } from './dates';

export interface RecoveryCheckin {
  sleep_hours?: number | null;
  sleep_quality: number; // 1–5
  energy: number; // 1–5
  soreness: number; // 1–5 (5 = muita dor)
  stress: number; // 1–5 (5 = muito estresse)
  motivation: number; // 1–5
}

export type RecoveryStatus = 'boa' | 'moderada' | 'baixa';

export const RECOVERY_LABEL: Record<RecoveryStatus, string> = {
  boa: 'Boa',
  moderada: 'Moderada',
  baixa: 'Baixa',
};

const clamp15 = (n: number) => Math.min(5, Math.max(1, n));
/** 1..5 → 0..1 */
const norm = (n: number) => (clamp15(n) - 1) / 4;

function sleepHoursScore(h: number): number {
  if (h >= 8) return 1;
  if (h >= 7) return 0.85;
  if (h >= 6) return 0.6;
  if (h >= 5) return 0.35;
  return 0.15;
}

/**
 * Índice subjetivo de recuperação (0–100). Indicador de autopercepção — não é diagnóstico.
 * Pesos: qualidade do sono 25%, horas de sono 15%, energia 20%, dor (inv.) 20%, estresse (inv.) 10%, motivação 10%.
 * Sem horas de sono, o peso é redistribuído.
 */
export function computeRecovery(c: RecoveryCheckin, baseline?: number[]) {
  const parts: { key: string; label: string; weight: number; score: number }[] = [
    { key: 'sleep_quality', label: 'Qualidade do sono', weight: 0.25, score: norm(c.sleep_quality) },
    { key: 'energy', label: 'Energia', weight: 0.2, score: norm(c.energy) },
    { key: 'soreness', label: 'Dor muscular', weight: 0.2, score: 1 - norm(c.soreness) },
    { key: 'stress', label: 'Estresse', weight: 0.1, score: 1 - norm(c.stress) },
    { key: 'motivation', label: 'Motivação', weight: 0.1, score: norm(c.motivation) },
  ];
  if (c.sleep_hours != null && c.sleep_hours > 0) {
    parts.push({ key: 'sleep_hours', label: 'Horas de sono', weight: 0.15, score: sleepHoursScore(c.sleep_hours) });
  }
  const totalW = parts.reduce((a, p) => a + p.weight, 0);
  const score = round((parts.reduce((a, p) => a + p.weight * p.score, 0) / totalW) * 100);
  let status: RecoveryStatus = score >= 70 ? 'boa' : score >= 50 ? 'moderada' : 'baixa';

  // Comparação com a média pessoal (se houver histórico suficiente).
  let vsBaseline: number | null = null;
  if (baseline && baseline.length >= 7) {
    const b = mean(baseline)!;
    vsBaseline = round(score - b);
    if (vsBaseline <= -15 && status === 'boa') status = 'moderada';
  }

  const limiting = parts
    .filter((p) => p.score < 0.5)
    .sort((a, b) => a.score - b.score)
    .map((p) => p.label);

  return { score, status, vsBaseline, limiting };
}
