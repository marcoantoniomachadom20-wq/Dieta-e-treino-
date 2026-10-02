import { useEffect, useState } from 'react';
import { WEEKDAY_SHORT, addDays } from '@app/core';
import { api } from '../lib/api';
import { useAction } from '../lib/hooks';
import { ACTIVITY_SHORT, shortDate } from '../lib/format';
import { Field, NumInput, ScalePicker, Segmented, Sheet } from './ui';

export const RPE_TEXT: Record<number, string> = {
  1: 'muito fácil',
  2: 'fácil',
  3: 'leve',
  4: 'um pouco cansativo',
  5: 'moderado',
  6: 'moderado+',
  7: 'difícil',
  8: 'muito difícil',
  9: 'quase máximo',
  10: 'máximo',
};

/** "Como foi o treino?" — RPE + duração + dados opcionais. */
export function CompleteSheet({ open, onClose, workout, onDone }: { open: boolean; onClose: () => void; workout: any; onDone?: (r: any) => void }) {
  const isLift = workout?.type === 'musculacao';
  const elapsed = workout?.started_at ? Math.max(1, Math.round((Date.now() - new Date(workout.started_at).getTime()) / 60000)) : null;
  const [f, setF] = useState<any>({});
  useEffect(() => {
    if (open) setF({ rpe: null, duration_min: elapsed && elapsed < 300 ? elapsed : isLift ? 55 : 90, calories: null, avg_hr: null, games: null, performance_rating: null, intensity: null, notes: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const done = useAction((b: any) => api.post(`/api/workouts/${workout.id}/complete`, b), {
    success: 'Treino concluído ✓',
    onSuccess: (r) => {
      onClose();
      onDone?.(r);
    },
  });
  if (!workout) return null;
  return (
    <Sheet open={open} onClose={onClose} title="Como foi o treino?">
      <div className="col">
        <Field group label={`Esforço percebido (RPE)${f.rpe ? ` — ${f.rpe}: ${RPE_TEXT[f.rpe]}` : ''}`}>
          <ScalePicker value={f.rpe} onChange={(rpe) => setF({ ...f, rpe })} min={1} max={10} labels={['1 muito fácil', '10 máximo']} />
        </Field>
        <div className="grid2">
          <Field label="Duração (min)">
            <NumInput value={f.duration_min} onChange={(v) => setF({ ...f, duration_min: v })} />
          </Field>
          <Field label="Calorias do relógio">
            <NumInput value={f.calories} onChange={(v) => setF({ ...f, calories: v })} placeholder="opcional" />
          </Field>
        </div>
        {!isLift && (
          <>
            <div className="grid2">
              <Field label={workout.type === 'tenis' ? 'Partidas/sets' : 'Jogos'}>
                <NumInput value={f.games} onChange={(v) => setF({ ...f, games: v })} placeholder="opcional" />
              </Field>
              <Field label="FC média">
                <NumInput value={f.avg_hr} onChange={(v) => setF({ ...f, avg_hr: v })} placeholder="opcional" />
              </Field>
            </div>
            <Field group label="Intensidade">
              <Segmented value={f.intensity ?? ''} onChange={(v) => setF({ ...f, intensity: v || null })} options={[{ value: 'leve', label: 'Leve' }, { value: 'moderada', label: 'Moderada' }, { value: 'intensa', label: 'Intensa' }]} />
            </Field>
            <Field group label="Desempenho (como você jogou)">
              <ScalePicker value={f.performance_rating} onChange={(v) => setF({ ...f, performance_rating: v })} labels={['mal', 'excelente']} />
            </Field>
          </>
        )}
        <Field label="Observações">
          <textarea className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Dores, sensação, o que funcionou…" />
        </Field>
        <button
          className="btn primary lg block"
          disabled={!f.rpe || !f.duration_min || done.isPending}
          onClick={() =>
            done.mutate({
              rpe: f.rpe,
              duration_min: f.duration_min,
              calories: f.calories,
              avg_hr: f.avg_hr ? Math.round(f.avg_hr) : null,
              games: f.games != null ? Math.round(f.games) : null,
              performance_rating: f.performance_rating,
              intensity: f.intensity,
              notes: f.notes || null,
            })
          }
        >
          Concluir {ACTIVITY_SHORT[workout.type].toLowerCase()}
        </button>
      </div>
    </Sheet>
  );
}

/** Mover sessão: horários rápidos (06:00, 12:30, 18:00, após o esporte) ou outro dia da semana. */
export function MoveSheet({ open, onClose, workout, weekStart, sportEnd }: { open: boolean; onClose: () => void; workout: any; weekStart: string; sportEnd?: string | null }) {
  const [date, setDate] = useState(workout?.date);
  const [time, setTime] = useState<string>(workout?.planned_time ?? '06:00');
  useEffect(() => {
    if (open && workout) {
      setDate(workout.date);
      setTime(workout.planned_time ?? '06:00');
    }
  }, [open, workout]);
  const move = useAction((b: any) => api.patch(`/api/workouts/${workout.id}`, b), { success: 'Sessão movida', onSuccess: onClose });
  if (!workout) return null;
  const quick = [
    { t: '06:00', l: '06:00' },
    { t: '12:30', l: '12:30' },
    { t: '18:00', l: '18:00' },
    ...(sportEnd ? [{ t: sportEnd, l: `Após o esporte (${sportEnd})` }] : []),
  ];
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  return (
    <Sheet open={open} onClose={onClose} title="Mover treino">
      <div className="col">
        <Field group label="Horário">
          <div className="row wrap">
            {quick.map((q) => (
              <button key={q.t} className={`btn sm ${time === q.t ? 'primary' : ''}`} onClick={() => setTime(q.t)}>
                {q.l}
              </button>
            ))}
            <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ width: 120 }} aria-label="Outro horário" />
          </div>
        </Field>
        <Field group label="Dia">
          <div className="grid4">
            {days.map((d) => (
              <button key={d} className={`btn sm ${date === d ? 'primary' : ''}`} onClick={() => setDate(d)}>
                {WEEKDAY_SHORT[new Date(d + 'T12:00:00Z').getUTCDay()]} {shortDate(d)}
              </button>
            ))}
          </div>
        </Field>
        <p className="xs muted" style={{ margin: 0 }}>
          Sessões movidas manualmente ficam fixas: o replanejamento automático não mexe nelas.
        </p>
        <button className="btn primary block" disabled={move.isPending} onClick={() => move.mutate({ date, planned_time: time })}>
          Salvar
        </button>
      </div>
    </Sheet>
  );
}

/** Registrar uma atividade não planejada. */
export function NewActivitySheet({ open, onClose, date, onCreated }: { open: boolean; onClose: () => void; date: string; onCreated: (w: any) => void }) {
  const [type, setType] = useState('futevolei');
  const [code, setCode] = useState('A');
  const create = useAction((b: any) => api.post('/api/workouts', b), {
    onSuccess: (w) => {
      onClose();
      onCreated(w);
    },
  });
  return (
    <Sheet open={open} onClose={onClose} title="Nova atividade">
      <div className="col">
        <Segmented
          value={type}
          onChange={setType}
          options={[
            { value: 'futevolei', label: 'Futvôlei' },
            { value: 'tenis', label: 'Tênis' },
            { value: 'musculacao', label: 'Musculação' },
            { value: 'recuperacao', label: 'Recuperação' },
            { value: 'outro', label: 'Outro' },
          ]}
        />
        {type === 'musculacao' && (
          <Field group label="Treino">
            <Segmented value={code} onChange={setCode} options={[{ value: 'A', label: 'A · superior' }, { value: 'B', label: 'B · inferior' }, { value: 'C', label: 'C · equilibrado' }, { value: '', label: 'Livre' }]} />
          </Field>
        )}
        <button className="btn primary block" disabled={create.isPending} onClick={() => create.mutate({ type, date, template_code: type === 'musculacao' && code ? code : undefined })}>
          Criar
        </button>
      </div>
    </Sheet>
  );
}
