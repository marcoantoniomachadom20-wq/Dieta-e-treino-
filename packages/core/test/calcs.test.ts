import { describe, it, expect } from 'vitest';
import { scaleFood, sumMacros, dailyProgress, macroCalorieCheck, bmrMifflin, rescale, suggestTargets } from '../src/nutrition';
import { estimateDailyExpenditure, energyBalance, adaptiveMaintenance, estimateActivityKcal } from '../src/energy';
import { computeRecovery } from '../src/recovery';
import { weightStats, movingAverageAt, weeklyRate } from '../src/weight';
import { e1rm, suggestNextLoad, setsVolume, exerciseProgression, loadTrend, strengthTrend } from '../src/performance';
import { computeStreak } from '../src/consistency';
import { goalProgress } from '../src/goals';
import { generateInsights } from '../src/insights';
import { buildWeeklyReport } from '../src/report';
import { addDays, weekStart, isValidISODate, todayInTz } from '../src/dates';

describe('datas', () => {
  it('semana começa na segunda', () => {
    expect(weekStart('2026-10-01')).toBe('2026-09-28');
    expect(weekStart('2026-10-04')).toBe('2026-09-28');
    expect(weekStart('2026-09-28')).toBe('2026-09-28');
  });
  it('valida datas', () => {
    expect(isValidISODate('2026-02-30')).toBe(false);
    expect(isValidISODate('2026-02-28')).toBe(true);
  });
  it('data local por fuso', () => {
    expect(todayInTz('America/Sao_Paulo', new Date('2026-10-02T02:00:00Z'))).toBe('2026-10-01');
  });
});

describe('nutrição', () => {
  const frango = { kcal_100: 159, protein_100: 32, carbs_100: 0, fat_100: 2.5 };
  it('escala por gramas', () => {
    expect(scaleFood(frango, 150)).toEqual({ calories: 239, protein: 48, carbs: 0, fat: 3.8 });
  });
  it('soma e restante', () => {
    const t = sumMacros([{ calories: 600, protein: 50, carbs: 60, fat: 15 }, { calories: 1050, protein: 75, carbs: 120, fat: 30 }]);
    expect(t.calories).toBe(1650);
    const p = dailyProgress(t, { calories: 2350, protein: 160, carbs: 270, fat: 70 });
    expect(p.calories.remaining).toBe(700);
    expect(p.protein.remaining).toBe(35);
    expect(p.calories.over).toBe(false);
  });
  it('excesso marcado como over', () => {
    const p = dailyProgress({ calories: 2500, protein: 10, carbs: 1, fat: 1 }, { calories: 2350, protein: 160, carbs: 270, fat: 70 });
    expect(p.calories.over).toBe(true);
    expect(p.calories.remaining).toBe(-150);
  });
  it('reescala porção', () => {
    expect(rescale({ calories: 248, protein: 46, carbs: 0, fat: 5 }, 150, 200).calories).toBe(331);
  });
  it('detecta inconsistência de calorias', () => {
    expect(macroCalorieCheck({ calories: 620, protein: 52, carbs: 68, fat: 14 }).consistent).toBe(true);
    expect(macroCalorieCheck({ calories: 1200, protein: 52, carbs: 68, fat: 14 }).consistent).toBe(false);
  });
  it('TMB do perfil inicial', () => {
    expect(bmrMifflin('masculino', 75, 175, 19)).toBe(1754);
    const s = suggestTargets({ sex: 'masculino', weightKg: 75, heightCm: 175, age: 19 });
    expect(s.protein.low).toBe(135);
    expect(s.calories).toBeGreaterThan(2200);
    expect(s.calories).toBeLessThan(2500);
  });
});

describe('energia', () => {
  it('usa total do relógio com faixa', () => {
    const e = estimateDailyExpenditure({ sex: 'masculino', weightKg: 75, heightCm: 175, age: 19, device: { total_calories: 2850 }, sessions: [] });
    expect(e.value).toBe(2850);
    expect(e.low).toBeLessThan(2850);
    expect(e.confidence).toBe('media');
  });
  it('sem relógio, confiança baixa', () => {
    const e = estimateDailyExpenditure({ sex: 'masculino', weightKg: 75, heightCm: 175, age: 19, sessions: [{ type: 'tenis', duration_min: 90, rpe: 7, calories: null }] });
    expect(e.confidence).toBe('baixa');
    expect(e.value).toBeGreaterThan(2500);
  });
  it('balanço é faixa e rotula déficit', () => {
    const exp = estimateDailyExpenditure({ sex: 'masculino', weightKg: 75, heightCm: 175, age: 19, device: { total_calories: 2850 }, sessions: [] });
    const b = energyBalance({ intakeKcal: 2350, mealsLogged: 5, dayClosed: true, expenditure: exp });
    expect(b.balance).toBe(-500);
    expect(b.balanceLow).toBeLessThan(b.balance);
    expect(b.balanceHigh).toBeGreaterThan(b.balance);
    expect(b.label).toBe('deficit');
  });
  it('poucas refeições derrubam a confiança', () => {
    const exp = estimateDailyExpenditure({ sex: 'masculino', weightKg: 75, heightCm: 175, age: 19, device: { total_calories: 2850 }, sessions: [] });
    expect(energyBalance({ intakeKcal: 500, mealsLogged: 1, dayClosed: false, expenditure: exp }).confidence).toBe('baixa');
  });
  it('kcal de atividade aumenta com RPE', () => {
    expect(estimateActivityKcal('futevolei', 60, 75, 9)).toBeGreaterThan(estimateActivityKcal('futevolei', 60, 75, 4));
  });
  it('manutenção adaptativa', () => {
    // 28 dias comendo 2300, perdendo 0,5 kg/semana → manutenção ≈ 2300 + 0,0714*7700 ≈ 2850
    const days = Array.from({ length: 28 }, (_, i) => ({ date: addDays('2026-09-01', i), intake: 2300, weight: 75 - (0.5 / 7) * i }));
    const r = adaptiveMaintenance(days)!;
    expect(r.value).toBeGreaterThan(2800);
    expect(r.value).toBeLessThan(2900);
    expect(adaptiveMaintenance(days.slice(0, 10))).toBeNull();
  });
});

describe('recuperação', () => {
  it('status por faixa', () => {
    expect(computeRecovery({ sleep_hours: 8, sleep_quality: 5, energy: 5, soreness: 1, stress: 1, motivation: 5 }).status).toBe('boa');
    expect(computeRecovery({ sleep_hours: 5, sleep_quality: 2, energy: 2, soreness: 4, stress: 4, motivation: 2 }).status).toBe('baixa');
    const r = computeRecovery({ sleep_hours: 6.5, sleep_quality: 3, energy: 3, soreness: 3, stress: 3, motivation: 3 });
    expect(r.status).toBe('moderada');
  });
  it('rebaixa quando muito abaixo do habitual', () => {
    const r = computeRecovery({ sleep_hours: 7, sleep_quality: 4, energy: 4, soreness: 2, stress: 2, motivation: 4 }, Array(10).fill(95));
    expect(r.status).toBe('moderada');
  });
});

describe('peso', () => {
  const entries = Array.from({ length: 30 }, (_, i) => ({ date: addDays('2026-09-01', i), weight_kg: 75 - i * 0.05 + (i % 2 ? 0.3 : -0.3) }));
  it('média móvel ignora ruído', () => {
    const avg = movingAverageAt(entries, '2026-09-30', 7)!;
    expect(avg).toBeGreaterThan(73.4);
    expect(avg).toBeLessThan(73.8);
  });
  it('estatísticas', () => {
    const s = weightStats(entries, '2026-09-30', 75);
    expect(s.initial).toBe(75);
    expect(s.min).toBeLessThan(s.max!);
    expect(s.rate!.kgPerWeek).toBeCloseTo(-0.35, 1);
  });
  it('taxa exige dados mínimos', () => {
    expect(weeklyRate(entries.slice(0, 4), '2026-09-04')).toBeNull();
  });
});

describe('performance', () => {
  it('e1RM e volume', () => {
    expect(e1rm(100, 1)).toBe(100);
    expect(e1rm(60, 10)).toBe(80);
    expect(e1rm(60, 20)).toBeNull();
    expect(setsVolume([{ weight_kg: 60, reps: 10, completed: true }, { weight_kg: 60, reps: 8, completed: false }])).toBe(600);
  });
  it('progressão dupla', () => {
    const top = [1, 2, 3, 4].map(() => ({ weight_kg: 60, reps: 10, rir: 1, completed: true }));
    expect(suggestNextLoad(top, 10).weight_kg).toBe(62.5);
    expect(suggestNextLoad([{ weight_kg: 60, reps: 8, rir: 2, completed: true }], 10).weight_kg).toBe(60);
    expect(suggestNextLoad([], 10).weight_kg).toBeNull();
  });
  it('PRs na progressão', () => {
    const p = exerciseProgression([
      { date: '2026-09-01', sets: [{ weight_kg: 60, reps: 8, completed: true }] },
      { date: '2026-09-05', sets: [{ weight_kg: 60, reps: 7, completed: true }] },
      { date: '2026-09-09', sets: [{ weight_kg: 62.5, reps: 8, completed: true }] },
    ]);
    expect(p.map((x) => x.isPR)).toEqual([true, false, true]);
  });
  it('tendência de carga', () => {
    const today = '2026-09-30';
    const s = [7, 14, 21].flatMap((w) => [{ date: addDays(today, -w), type: 'tenis' as const, rpe: 6, duration_min: 60 }]);
    s.push({ date: today, type: 'tenis', rpe: 9, duration_min: 120 });
    expect(loadTrend(s, today).label).toBe('alta');
  });
  it('tendência de força', () => {
    const today = '2026-09-30';
    const mk = (d: number, w: number) => ({ date: addDays(today, -d), sets: [{ weight_kg: w, reps: 8, completed: true }] });
    const t = strengthTrend({ supino: [mk(30, 60), mk(5, 65)], remada: [mk(30, 60), mk(5, 64)] }, today);
    expect(t.trend).toBe('subindo');
  });
});

describe('sequência', () => {
  it('conta dias cumpridos e ignora hoje incompleto', () => {
    const d = (date: string, ok: boolean) => ({ date, foodLogged: ok, plannedRequired: 1, completedRequired: ok ? 1 : 0, skippedRequired: 0 });
    const days = [d('2026-09-27', true), d('2026-09-28', true), d('2026-09-29', true), d('2026-09-30', false)];
    expect(computeStreak(days, '2026-09-30')).toBe(3);
    expect(computeStreak([...days.slice(0, 3), d('2026-09-30', true)], '2026-09-30')).toBe(4);
  });
});

describe('metas', () => {
  it('meta de redução', () => {
    expect(goalProgress({ kind: 'peso_alvo', start_value: 75, target_value: 71 }, 73).pct).toBe(50);
    expect(goalProgress({ kind: 'musculacao_semana', start_value: null, target_value: 3 }, 2).pct).toBe(67);
    expect(goalProgress({ kind: 'carga_exercicio', start_value: 60, target_value: 80 }, 70).pct).toBe(50);
  });
});

describe('insights', () => {
  const base = {
    goal: 'perda_gordura' as const,
    weightRate: null,
    previousWeightRate: null,
    strengthTrend: null,
    avgProtein7d: 160,
    proteinTarget: 160,
    avgCalories7d: 2300,
    calorieTarget: 2350,
    daysFoodLogged7d: 7,
    avgRecoveryScore3d: 75,
    avgSleepHours7d: 8,
    loadTrend: { label: 'estavel' as const, ratio: 1 },
    liftsThisWeek: 2,
    liftTarget: 3,
    daysLeftInWeek: 3,
  };
  it('perda rápida + queda de performance', () => {
    const r = generateInsights({ ...base, weightRate: { kgPerWeek: -1, pctPerWeek: -1.4, points: 20 }, strengthTrend: 'caindo' });
    expect(r.map((x) => x.id)).toContain('perda_rapida_performance');
  });
  it('peso estável', () => {
    const r = generateInsights({ ...base, weightRate: { kgPerWeek: 0.05, pctPerWeek: 0.07, points: 20 } });
    expect(r.map((x) => x.id)).toContain('peso_estavel');
  });
  it('sem dados, sem conclusões de peso', () => {
    const r = generateInsights(base);
    expect(r.find((x) => x.id.startsWith('peso') || x.id.startsWith('perda'))).toBeUndefined();
  });
});

describe('relatório semanal', () => {
  it('monta resumo coerente', () => {
    const r = buildWeeklyReport({
      weekStart: '2026-09-28', weekEnd: '2026-10-04', avgWeight: 74.6, prevAvgWeight: 75.0, weighIns: 6,
      avgCalories: 2320, avgProtein: 157, calorieTarget: 2350, proteinTarget: 160, daysLogged: 7, daysOnTarget: 6,
      lifts: { done: 3, planned: 3 }, futevolei: { done: 2, planned: 2 }, tenis: { done: 2, planned: 2 },
      liftVolume: 30000, prevLiftVolume: 28000, avgRecovery: 74, avgSleep: 7.6, strengthTrend: 'subindo', prs: [], skipped: 0,
    });
    expect(r.weight.change).toBe(-0.4);
    expect(r.training.adherence).toBe(100);
    expect(r.nutrition.dietAdherence).toBe(86);
    expect(r.summary).toMatch(/consistente/);
    expect(r.summary).toMatch(/moderada/);
    expect(r.performance.arrow).toBe('↑');
  });
});
