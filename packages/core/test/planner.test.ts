import { describe, it, expect } from 'vitest';
import { planWeek, DEFAULT_AVAILABILITY, sessionAdvice, slotTime, type PlannerSport } from '../src/planner';
import { DEFAULT_PROGRAM } from '../src/program';
import { addDays } from '../src/dates';

const MON = '2026-09-28';
const templates = DEFAULT_PROGRAM.map((t) => ({ code: t.code, name: t.name, lower_load: t.lower_load, upper_load: t.upper_load }));

function routine(weekStart: string): PlannerSport[] {
  const d = (n: number) => addDays(weekStart, n);
  return [
    { date: d(-2), type: 'futevolei', time: '12:00', optional: true },
    { date: d(0), type: 'futevolei', time: '19:30', optional: false },
    { date: d(1), type: 'tenis', time: '19:00', optional: false },
    { date: d(2), type: 'futevolei', time: '19:30', optional: false },
    { date: d(3), type: 'tenis', time: '19:00', optional: false },
    { date: d(4), type: 'futevolei', time: '12:00', optional: true },
    { date: d(7), type: 'futevolei', time: '19:30', optional: false },
    { date: d(8), type: 'tenis', time: '19:00', optional: false },
  ];
}

const base = {
  weekStart: MON,
  fromDate: MON,
  templates,
  doneLifts: [],
  availability: DEFAULT_AVAILABILITY,
  targetSessions: 3,
};

describe('planWeek', () => {
  it('distribui A, B e C em dias diferentes', () => {
    const r = planWeek({ ...base, sports: routine(MON) });
    expect(r.sessions).toHaveLength(3);
    expect(new Set(r.sessions.map((s) => s.date)).size).toBe(3);
    expect(r.sessions.map((s) => s.code).sort()).toEqual(['A', 'B', 'C']);
  });

  it('nunca coloca pernas (B) de manhã antes de um esporte obrigatório nem na véspera de um', () => {
    const sports = routine(MON);
    const r = planWeek({ ...base, sports });
    const b = r.sessions.find((s) => s.code === 'B')!;
    const required = sports.filter((s) => !s.optional);
    const sameDayBefore = required.some((s) => s.date === b.date && b.slot !== 'pos_esporte');
    const nextDay = required.some((s) => s.date === addDays(b.date, 1));
    expect(sameDayBefore).toBe(false);
    expect(nextDay).toBe(false);
  });

  it('não coloca pernas na quinta após futvôlei intenso na quarta', () => {
    const sports = routine(MON).map((s) => (s.date === addDays(MON, 2) ? { ...s, status: 'concluido' as const, rpe: 9 } : s));
    const r = planWeek({ ...base, sports, fromDate: addDays(MON, 3) });
    const thursday = r.sessions.find((s) => s.date === addDays(MON, 3));
    expect(thursday?.code).not.toBe('B');
  });

  it('reorganiza sem duplicar quando um treino é perdido', () => {
    // Fez A na segunda; perdeu a terça; replaneja a partir de quarta.
    const r = planWeek({ ...base, sports: routine(MON), fromDate: addDays(MON, 2), doneLifts: [{ date: MON, code: 'A' }] });
    const codes = r.sessions.map((s) => s.code);
    expect(codes).not.toContain('A');
    expect(new Set(r.sessions.map((s) => s.date)).size).toBe(r.sessions.length);
    expect(r.sessions.length + r.dropped.length).toBe(2);
  });

  it('descarta em vez de empilhar quando não há dias', () => {
    const r = planWeek({ ...base, sports: routine(MON), fromDate: addDays(MON, 5) });
    expect(r.sessions.length).toBeLessThanOrEqual(1);
    expect(r.dropped.length).toBeGreaterThanOrEqual(2);
  });

  it('evita treino pesado no dia de recuperação baixa', () => {
    const tue = addDays(MON, 1);
    const r = planWeek({ ...base, sports: routine(MON), fromDate: tue, readiness: { date: tue, status: 'baixa' } });
    expect(r.sessions.find((s) => s.date === tue)).toBeUndefined();
  });

  it('encaixe "após o esporte" só existe quando há esporte no dia', () => {
    expect(slotTime('pos_esporte', addDays(MON, 1), routine(MON))).toBe('20:50');
    expect(slotTime('pos_esporte', addDays(MON, 5), routine(MON))).toBeNull();
  });
});

describe('sessionAdvice', () => {
  it('reduz volume com recuperação baixa', () => {
    const a = sessionAdvice({ template: { code: 'A', lower_load: 0.25 }, recovery: 'baixa', sportLaterToday: null, sportTomorrow: null, loadTrend: 'estavel' });
    expect(a.level).toBe('leve');
    expect(a.upperSetsDelta).toBe(-1);
  });
  it('corta pernas quando há futvôlei mais tarde', () => {
    const a = sessionAdvice({ template: { code: 'B', lower_load: 1 }, recovery: 'boa', sportLaterToday: 'futevolei', sportTomorrow: null, loadTrend: 'estavel' });
    expect(a.lowerSetsDelta).toBe(-1);
  });
});
