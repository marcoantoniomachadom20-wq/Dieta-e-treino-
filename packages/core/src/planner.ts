import { addDays, diffDays, weekday, round, WEEKDAY_NAMES, type ISODate } from './dates';
import { ACTIVITY_LABELS, type ActivityType } from './types';
import type { RecoveryStatus } from './recovery';

/**
 * PLANEJADOR SEMANAL DE MUSCULAÇÃO
 *
 * Os esportes têm horário fixo; a musculação é que se encaixa ao redor deles.
 * Para cada combinação possível (template → dia/horário) calcula-se uma penalidade baseada em:
 *   - fadiga de membros inferiores/superiores levada para um esporte no mesmo dia ou no seguinte;
 *   - sessões de musculação em dias consecutivos;
 *   - preferência de horário (manhã > após o esporte > fim de semana);
 *   - recuperação relatada no dia.
 * Busca exaustiva (o espaço é pequeno: ≤ 3 sessões × ~12 encaixes) e escolhe a menor penalidade.
 * Pular uma sessão também tem custo — o planejador só descarta quando encaixá-la seria pior que perdê-la.
 * Os pesos são heurísticos e documentados em docs/DECISIONS.md; não são verdade científica.
 */

export type SlotId = 'manha' | 'almoco' | 'tarde' | 'pos_esporte';

export const SLOT_LABEL: Record<SlotId, string> = {
  manha: 'manhã',
  almoco: 'almoço',
  tarde: 'fim da tarde',
  pos_esporte: 'após o esporte',
};

export const SLOT_DEFAULT_TIME: Record<Exclude<SlotId, 'pos_esporte'>, string> = {
  manha: '06:00',
  almoco: '12:30',
  tarde: '18:00',
};

export interface PlannerSport {
  date: ISODate;
  type: ActivityType;
  time: string | null; // HH:MM
  duration_min?: number | null;
  optional: boolean;
  status?: 'planejado' | 'em_andamento' | 'concluido' | 'pulado';
  rpe?: number | null;
}

export interface PlannerTemplate {
  code: string;
  name: string;
  lower_load: number;
  upper_load: number;
}

export interface PlannerInput {
  /** Segunda-feira da semana planejada. */
  weekStart: ISODate;
  /** Primeiro dia ainda planejável (hoje ou amanhã). */
  fromDate: ISODate;
  /** Esportes da semana E dos dias vizinhos (2 dias antes, 3 depois) para contexto. */
  sports: PlannerSport[];
  templates: PlannerTemplate[];
  /** Musculações já feitas (ou em andamento) nesta semana e nos 2 dias anteriores. */
  doneLifts: { date: ISODate; code: string }[];
  /** Encaixes permitidos por dia da semana (0=dom..6=sáb). */
  availability: Record<number, SlotId[]>;
  /** Quantas sessões de musculação por semana (normalmente = nº de templates). */
  targetSessions: number;
  readiness?: { date: ISODate; status: RecoveryStatus } | null;
}

export interface PlannedLift {
  date: ISODate;
  code: string;
  slot: SlotId;
  time: string;
  penalty: number;
  reasons: string[];
}

export interface PlanResult {
  sessions: PlannedLift[];
  dropped: { code: string; reason: string }[];
  totalPenalty: number;
}

const STRESS: Record<ActivityType, { lower: number; upper: number }> = {
  futevolei: { lower: 1, upper: 0.4 },
  tenis: { lower: 0.8, upper: 0.7 },
  musculacao: { lower: 0, upper: 0 },
  recuperacao: { lower: 0, upper: 0 },
  outro: { lower: 0.5, upper: 0.5 },
};

const DROP_PENALTY: Record<string, number> = { A: 10, B: 10, C: 8 };

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function fromMin(m: number): string {
  const h = Math.floor(m / 60) % 24;
  return `${String(h).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
}

function sportWeight(s: PlannerSport): number {
  if (s.status === 'pulado') return 0;
  let w = s.optional ? 0.5 : 1;
  if (s.status === 'concluido' && s.rpe) w *= Math.min(1.4, Math.max(0.6, s.rpe / 7));
  return w;
}

/** Horário em que um encaixe acontece, ou null se o encaixe não é viável nesse dia. */
export function slotTime(slot: SlotId, date: ISODate, sports: PlannerSport[]): string | null {
  if (slot !== 'pos_esporte') return SLOT_DEFAULT_TIME[slot];
  const sameDay = sports.filter((s) => s.date === date && s.time && sportWeight(s) > 0 && s.type !== 'recuperacao');
  if (!sameDay.length) return null;
  const last = sameDay.sort((a, b) => toMin(b.time!) - toMin(a.time!))[0];
  return fromMin(toMin(last.time!) + (last.duration_min ?? 90) + 20);
}

function placementPenalty(
  t: PlannerTemplate,
  date: ISODate,
  slot: SlotId,
  time: string,
  input: PlannerInput,
): { penalty: number; reasons: string[] } {
  let p = 0;
  const reasons: string[] = [];
  const liftMin = toMin(time);

  for (const s of input.sports) {
    const w = sportWeight(s);
    if (!w) continue;
    const st = STRESS[s.type];
    const dd = diffDays(date, s.date); // >0: esporte depois do treino
    const label = ACTIVITY_LABELS[s.type].toLowerCase();
    if (dd === 0 && s.time) {
      if (liftMin < toMin(s.time)) {
        p += (5 * t.lower_load * st.lower + 1.5 * t.upper_load * st.upper) * w;
        if (t.lower_load >= 0.6 && w >= 1) reasons.push(`Atenção: pernas no mesmo dia do ${label} (${s.time}).`);
      } else {
        p += (0.5 * (t.lower_load * st.lower + t.upper_load * st.upper) + 0.5) * w;
      }
    } else if (dd === 1) {
      p += (3 * t.lower_load * st.lower + 0.8 * t.upper_load * st.upper) * w;
    } else if (dd === 2) {
      p += 1 * t.lower_load * st.lower * w;
    } else if (dd === -1) {
      p += 0.8 * t.lower_load * st.lower * w;
    }
  }

  if (slot === 'pos_esporte') p += 1;
  if (slot === 'almoco') p += 0.3;
  if (slot === 'tarde') p += 0.3;
  const wd = weekday(date);
  if (wd === 6) p += 1.5;
  if (wd === 0) p += 2.5;

  if (input.readiness && input.readiness.date === date) {
    if (input.readiness.status === 'baixa') p += 3 * (t.lower_load + t.upper_load);
    else if (input.readiness.status === 'moderada') p += 1.5 * t.lower_load;
  }

  // Explicação legível: próximo esporte depois deste treino.
  const next = input.sports
    .filter((s) => sportWeight(s) > 0 && (s.date > date || (s.date === date && s.time && toMin(s.time) > liftMin)))
    .sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))[0];
  if (next) {
    const gap = diffDays(date, next.date);
    const when = gap === 0 ? `hoje às ${next.time}` : gap === 1 ? 'amanhã' : `em ${gap} dias (${WEEKDAY_NAMES[weekday(next.date)]})`;
    const maybe = next.optional ? ' (possível)' : '';
    if (t.lower_load >= 0.6) reasons.push(`Próximo esporte ${when}: ${ACTIVITY_LABELS[next.type]}${maybe}.`);
    else if (gap === 0) reasons.push(`Foco superior: pernas preservadas para o ${ACTIVITY_LABELS[next.type].toLowerCase()} ${when}${maybe}.`);
  }
  if (slot === 'pos_esporte') reasons.push('Depois do esporte, para não chegar ao jogo fadigado.');

  return { penalty: p, reasons };
}

function pairPenalty(a: { date: ISODate; lower: number }, b: { date: ISODate; lower: number }): number {
  const gap = Math.abs(diffDays(a.date, b.date));
  let p = 0;
  if (gap === 0) return 100;
  if (gap === 1) {
    p += 1.5;
    if (a.lower >= 0.6 && b.lower >= 0.6) p += 2;
  }
  return p;
}

export function planWeek(input: PlannerInput): PlanResult {
  const weekEnd = addDays(input.weekStart, 6);
  const doneThisWeek = input.doneLifts.filter((l) => l.date >= input.weekStart && l.date <= weekEnd);
  const doneCodes = new Set(doneThisWeek.map((l) => l.code));
  const remainingCount = Math.max(0, input.targetSessions - doneThisWeek.length);
  const remaining = input.templates.filter((t) => !doneCodes.has(t.code)).slice(0, remainingCount);
  const tmplByCode = Object.fromEntries(input.templates.map((t) => [t.code, t]));
  const busyDays = new Set(input.doneLifts.map((l) => l.date));

  const options: { date: ISODate; slot: SlotId; time: string }[] = [];
  for (let d = input.fromDate > input.weekStart ? input.fromDate : input.weekStart; d <= weekEnd; d = addDays(d, 1)) {
    if (busyDays.has(d)) continue;
    for (const slot of input.availability[weekday(d)] ?? []) {
      const time = slotTime(slot, d, input.sports);
      if (time) options.push({ date: d, slot, time });
    }
  }

  const fixed = input.doneLifts.map((l) => ({ date: l.date, lower: tmplByCode[l.code]?.lower_load ?? 0.5 }));
  const cache = new Map<string, { penalty: number; reasons: string[] }>();
  const cost = (t: PlannerTemplate, o: (typeof options)[number]) => {
    const k = `${t.code}|${o.date}|${o.slot}`;
    if (!cache.has(k)) cache.set(k, placementPenalty(t, o.date, o.slot, o.time, input));
    return cache.get(k)!;
  };

  let best: { total: number; picks: ((typeof options)[number] | null)[] } = { total: Infinity, picks: [] };
  const picks: ((typeof options)[number] | null)[] = [];

  const search = (i: number, acc: number) => {
    if (acc >= best.total) return;
    if (i === remaining.length) {
      best = { total: acc, picks: [...picks] };
      return;
    }
    const t = remaining[i];
    for (const o of options) {
      if (picks.some((p) => p && p.date === o.date)) continue;
      let add = cost(t, o).penalty;
      for (const f of fixed) add += pairPenalty({ date: o.date, lower: t.lower_load }, f);
      picks.forEach((p, j) => {
        if (p) add += pairPenalty({ date: o.date, lower: t.lower_load }, { date: p.date, lower: remaining[j].lower_load });
      });
      picks.push(o);
      search(i + 1, acc + add);
      picks.pop();
    }
    picks.push(null);
    search(i + 1, acc + (DROP_PENALTY[t.code] ?? 9));
    picks.pop();
  };
  search(0, 0);

  const sessions: PlannedLift[] = [];
  const dropped: PlanResult['dropped'] = [];
  remaining.forEach((t, i) => {
    const o = best.picks[i];
    if (!o) {
      dropped.push({
        code: t.code,
        reason: options.length
          ? `Não há encaixe na semana sem prejudicar os esportes ou a recuperação; ${t.name} fica para a próxima semana.`
          : `Não restam dias disponíveis nesta semana; ${t.name} fica para a próxima.`,
      });
      return;
    }
    const c = cost(t, o);
    sessions.push({ date: o.date, code: t.code, slot: o.slot, time: o.time, penalty: round(c.penalty, 2), reasons: c.reasons });
  });
  sessions.sort((a, b) => a.date.localeCompare(b.date));
  return { sessions, dropped, totalPenalty: round(best.total, 2) };
}

/** Disponibilidade padrão baseada na rotina do usuário. */
export const DEFAULT_AVAILABILITY: Record<number, SlotId[]> = {
  0: [],
  1: ['manha'],
  2: ['manha', 'pos_esporte'],
  3: ['manha'],
  4: ['manha', 'pos_esporte'],
  5: ['manha', 'pos_esporte'],
  6: ['manha'],
};

export interface SessionAdviceInput {
  template: { code: string; lower_load: number };
  recovery: RecoveryStatus | null;
  sportLaterToday: ActivityType | null;
  sportTomorrow: ActivityType | null;
  loadTrend: 'sem_base' | 'baixa' | 'estavel' | 'alta';
}

/**
 * Ajuste do treino do dia conforme prontidão. Retorna deltas de séries e RIR alvo.
 * Regra geral: em dúvida, reduza volume (séries) antes de reduzir intensidade (carga).
 */
export function sessionAdvice(i: SessionAdviceInput) {
  const messages: string[] = [];
  let lowerSetsDelta = 0;
  let upperSetsDelta = 0;
  let rir = '1–2';
  let level: 'normal' | 'reduzido' | 'leve' = 'normal';

  if (i.recovery === 'baixa') {
    lowerSetsDelta -= 1;
    upperSetsDelta -= 1;
    rir = '3+';
    level = 'leve';
    messages.push('Recuperação baixa: uma série a menos por exercício e RIR 3+. Se piorar no aquecimento, pare.');
  } else if (i.recovery === 'moderada') {
    rir = '2–3';
    level = 'reduzido';
    messages.push('Recuperação moderada: mantenha as séries, mas sem ir à falha (RIR 2–3).');
  }
  if (i.sportLaterToday && i.template.lower_load >= 0.6 && STRESS[i.sportLaterToday].lower >= 0.8) {
    lowerSetsDelta -= 1;
    level = level === 'normal' ? 'reduzido' : level;
    messages.push(`${ACTIVITY_LABELS[i.sportLaterToday]} mais tarde: corte uma série de cada exercício de perna.`);
  } else if (i.sportTomorrow && i.template.lower_load >= 0.6 && STRESS[i.sportTomorrow].lower >= 0.8) {
    messages.push(`${ACTIVITY_LABELS[i.sportTomorrow]} amanhã: pernas com RIR 3, nada de falha.`);
  }
  if (i.loadTrend === 'alta') {
    upperSetsDelta = Math.min(upperSetsDelta, 0) - (level === 'normal' ? 1 : 0);
    lowerSetsDelta = Math.min(lowerSetsDelta, 0) - (level === 'normal' ? 1 : 0);
    level = level === 'normal' ? 'reduzido' : level;
    messages.push('Carga dos últimos 7 dias bem acima do seu habitual: volume reduzido por prudência.');
  }
  if (!messages.length) messages.push('Tudo certo para o treino planejado. Progrida as cargas onde bateu o topo da faixa.');
  return { level, lowerSetsDelta, upperSetsDelta, rir, messages };
}
