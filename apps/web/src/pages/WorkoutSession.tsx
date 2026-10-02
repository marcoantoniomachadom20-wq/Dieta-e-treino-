import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, MessageSquare, Plus, RotateCcw, Timer, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAction, useApi } from '../lib/hooks';
import { ACTIVITY_COLOR, ACTIVITY_SHORT, dateLabel, n0, n1 } from '../lib/format';
import { Card, Field, Loading, NumInput, Sheet, Stat, useToast } from '../components/ui';
import { CompleteSheet, RPE_TEXT } from '../components/WorkoutSheets';

function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return (
    <span className="tabular">
      {h ? `${h}:` : ''}
      {String(m).padStart(h ? 2 : 1, '0')}:{String(s % 60).padStart(2, '0')}
    </span>
  );
}

export function WorkoutSession() {
  const { id } = useParams();
  const url = `/api/workouts/${id}`;
  const q = useApi<any>(url);
  const qc = useQueryClient();
  const nav = useNavigate();
  const toast = useToast();
  const [finish, setFinish] = useState(false);
  const [addEx, setAddEx] = useState(false);
  const [exName, setExName] = useState('');
  const [noteFor, setNoteFor] = useState<any>(null);
  const [note, setNote] = useState('');

  const start = useAction(() => api.post(`${url}/start`));
  const reopen = useAction(() => api.post(`${url}/reopen`), { success: 'Sessão reaberta para edição' });
  const del = useAction(() => api.del(url), { success: 'Sessão excluída', onSuccess: () => nav('/treinos', { replace: true }) });
  const addExercise = useAction((name: string) => api.post(`${url}/exercises`, { name }), { onSuccess: () => { setAddEx(false); setExName(''); } });
  const saveNote = useAction((v: { id: number; notes: string }) => api.patch(`/api/workout-exercises/${v.id}`, { notes: v.notes || null }), { onSuccess: () => setNoteFor(null) });
  const addSet = useAction((exId: number) => api.post(`/api/workout-exercises/${exId}/sets`));
  const delSet = useAction((setId: number) => api.del(`/api/sets/${setId}`));

  /** Atualização otimista da série: a tela responde na hora e grava em segundo plano. */
  const patchSet = async (exId: number, set: any, patch: any) => {
    const prev = qc.getQueryData<any>([url]);
    qc.setQueryData([url], (w: any) => ({
      ...w,
      exercises: w.exercises.map((e: any) => (e.id !== exId ? e : { ...e, sets: e.sets.map((s: any) => (s.id === set.id ? { ...s, ...patch } : s)) })),
    }));
    try {
      await api.patch(`/api/sets/${set.id}`, patch);
    } catch (e: any) {
      qc.setQueryData([url], prev);
      toast(e.message, true);
    }
  };

  const toggleSet = (ex: any, set: any, idx: number) => {
    if (set.completed) return patchSet(ex.id, set, { completed: false });
    // Sem reps digitadas: assume a série anterior ou o topo da faixa — editável depois.
    const reps = set.reps ?? ex.sets[idx - 1]?.reps ?? ex.rep_max;
    const weight = set.weight_kg ?? ex.sets[idx - 1]?.weight_kg ?? null;
    return patchSet(ex.id, set, { completed: true, reps, weight_kg: weight });
  };

  if (q.isLoading || !q.data) return <Loading />;
  const w = q.data;
  const isLift = w.type === 'musculacao';
  const editable = w.status === 'em_andamento';
  const totalSets = w.exercises.reduce((a: number, e: any) => a + e.sets.length, 0);
  const doneSets = w.exercises.reduce((a: number, e: any) => a + e.sets.filter((s: any) => s.completed).length, 0);

  return (
    <>
      <header className="topbar">
        <button className="icon-btn" onClick={() => nav(-1)} aria-label="Voltar">
          <ArrowLeft size={18} />
        </button>
        <div className="grow">
          <div className="eyebrow" style={{ color: ACTIVITY_COLOR[w.type] }}>
            {ACTIVITY_SHORT[w.type]} · {dateLabel(w.date, { weekday: true })}
          </div>
          <h1 style={{ fontSize: 22 }}>{w.template ? `${w.template.name}` : ACTIVITY_SHORT[w.type]}</h1>
          {w.template && <div className="small muted">{w.template.focus}</div>}
        </div>
      </header>

      {editable && (
        <Card className="tight">
          <div className="row between">
            <span className="row sec">
              <Timer size={18} /> <Elapsed since={w.started_at} />
            </span>
            <span className="small sec tabular">
              {doneSets}/{totalSets} séries
            </span>
          </div>
          <div className="bar" style={{ marginTop: 8 }}>
            <span style={{ width: `${totalSets ? (doneSets / totalSets) * 100 : 0}%`, background: 'var(--good)' }} />
          </div>
          {w.advice?.messages && <p className="xs sec" style={{ margin: '8px 0 0' }}>{w.advice.messages.join(' ')}</p>}
        </Card>
      )}

      {w.status === 'planejado' && isLift && (
        <Card>
          <div className="list">
            {w.preview?.map((e: any) => (
              <div className="list-item" key={e.id}>
                <div className="grow">
                  <b>{e.name}</b>
                  <div className="xs muted">
                    {e.sets}×{e.rep_min}–{e.rep_max} · {e.suggestion.reason}
                  </div>
                </div>
                {e.suggestion.weight_kg != null && <span className="chip accent">{n1(e.suggestion.weight_kg)} kg</span>}
              </div>
            ))}
          </div>
          <button className="btn primary lg block" style={{ marginTop: 12 }} onClick={() => start.mutate(undefined)} disabled={start.isPending}>
            Iniciar treino
          </button>
        </Card>
      )}

      {w.status === 'planejado' && !isLift && (
        <Card>
          <p className="small sec" style={{ marginTop: 0 }}>Planejado para {w.planned_time ?? 'horário livre'}.</p>
          <button className="btn primary block" onClick={() => setFinish(true)}>
            Registrar
          </button>
        </Card>
      )}

      {w.status === 'concluido' && (
        <div className="grid2" style={{ marginBottom: 12 }}>
          <Stat label="Duração" value={n0(w.duration_min)} unit="min" />
          <Stat label="Esforço (RPE)" value={w.rpe} unit="/10" sub={RPE_TEXT[w.rpe]} />
          {isLift ? <Stat label="Volume" value={n0(w.volume_kg)} unit="kg" sub="carga × reps" /> : <Stat label="Desempenho" value={w.performance_rating ?? '–'} unit="/5" sub={w.intensity ?? ''} />}
          <Stat label="Calorias" value={w.calories ? n0(w.calories) : '–'} unit="kcal" sub={w.games != null ? `${w.games} jogos` : w.avg_hr ? `FC ${w.avg_hr}` : 'do relógio'} />
        </div>
      )}
      {w.status === 'concluido' && w.notes && (
        <Card className="tight">
          <div className="xs muted">Observações</div>
          <div className="small">{w.notes}</div>
        </Card>
      )}
      {w.status === 'pulado' && (
        <Card className="tight">
          <b>Sessão não realizada.</b> {w.notes && <span className="sec small">Motivo: {w.notes}</span>}
        </Card>
      )}

      {w.exercises.map((ex: any) => {
        const allDone = ex.sets.length > 0 && ex.sets.every((s: any) => s.completed);
        const last = ex.last?.filter((s: any) => s.completed) ?? [];
        return (
          <Card key={ex.id} className={allDone && editable ? 'done-ex' : ''}>
            <div className="row between" style={{ marginBottom: 8 }}>
              <div className="grow">
                <h3>{ex.name}</h3>
                <div className="xs muted">
                  {ex.target_sets}×{ex.rep_min}–{ex.rep_max}
                  {last.length ? ` · última: ${last.map((s: any) => `${n1(s.weight_kg)}×${s.reps}`).slice(0, 4).join(', ')}` : ' · sem histórico'}
                </div>
                {ex.suggestion && ex.suggested_weight != null && editable && <div className="xs" style={{ color: 'var(--accent)' }}>{ex.suggestion}</div>}
              </div>
              {editable && (
                <button className="icon-btn" aria-label="Observação" onClick={() => { setNoteFor(ex); setNote(ex.notes ?? ''); }}>
                  <MessageSquare size={16} />
                </button>
              )}
            </div>
            <div className="col" style={{ gap: 6 }}>
              <div className="set-row set-head">
                <span>#</span>
                <span>kg</span>
                <span>reps</span>
                <span>RIR</span>
                <span />
              </div>
              {ex.sets.map((s: any, i: number) => (
                <div className="set-row" key={s.id}>
                  <span className="muted tabular small">{s.set_number}</span>
                  <NumInput value={s.weight_kg} disabled={!editable} onChange={() => {}} onBlur={(e) => {
                    const v = parseFloat(e.target.value.replace(',', '.'));
                    const nv = Number.isNaN(v) ? null : v;
                    if (nv !== s.weight_kg) patchSet(ex.id, s, { weight_kg: nv });
                  }} aria-label={`Carga série ${s.set_number}`} placeholder={ex.suggested_weight != null ? String(ex.suggested_weight).replace('.', ',') : '–'} />
                  <NumInput value={s.reps} disabled={!editable} onChange={() => {}} onBlur={(e) => {
                    const v = parseInt(e.target.value, 10);
                    const nv = Number.isNaN(v) ? null : v;
                    if (nv !== s.reps) patchSet(ex.id, s, { reps: nv });
                  }} aria-label={`Repetições série ${s.set_number}`} placeholder={`${ex.rep_min}–${ex.rep_max}`} />
                  <select className="input" disabled={!editable} value={s.rir ?? ''} aria-label={`RIR série ${s.set_number}`} onChange={(e) => patchSet(ex.id, s, { rir: e.target.value === '' ? null : Number(e.target.value) })}>
                    <option value="">–</option>
                    {[0, 1, 2, 3, 4, 5].map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  <button className={`check ${s.completed ? 'on' : ''}`} disabled={!editable} onClick={() => toggleSet(ex, s, i)} aria-label={s.completed ? 'Desmarcar série' : 'Concluir série'} aria-pressed={!!s.completed}>
                    <Check size={18} />
                  </button>
                </div>
              ))}
            </div>
            {ex.notes && <p className="xs sec" style={{ margin: '8px 0 0' }}>📝 {ex.notes}</p>}
            {editable && (
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn sm ghost" onClick={() => addSet.mutate(ex.id)}>
                  <Plus size={14} /> Série
                </button>
                {ex.sets.length > 1 && (
                  <button className="btn sm ghost" onClick={() => delSet.mutate(ex.sets[ex.sets.length - 1].id)}>
                    <Trash2 size={14} /> Última série
                  </button>
                )}
              </div>
            )}
          </Card>
        );
      })}

      {editable && (
        <>
          <button className="btn block" style={{ marginTop: 12 }} onClick={() => setAddEx(true)}>
            <Plus size={16} /> Adicionar exercício
          </button>
          <button className="btn primary lg block" style={{ marginTop: 12 }} onClick={() => setFinish(true)}>
            Concluir treino
          </button>
        </>
      )}

      {w.status === 'concluido' && (
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn grow" onClick={() => reopen.mutate(undefined)}>
            <RotateCcw size={16} /> Reabrir para editar
          </button>
          <button className="btn danger" onClick={() => confirm('Excluir esta sessão e todas as séries?') && del.mutate(undefined)} aria-label="Excluir sessão">
            <Trash2 size={16} />
          </button>
        </div>
      )}
      {w.status !== 'concluido' && !editable && (
        <button className="btn ghost danger block" style={{ marginTop: 12 }} onClick={() => confirm('Excluir esta sessão?') && del.mutate(undefined)}>
          Excluir sessão
        </button>
      )}

      <CompleteSheet open={finish} onClose={() => setFinish(false)} workout={w} />
      <Sheet open={addEx} onClose={() => setAddEx(false)} title="Adicionar exercício">
        <div className="col">
          <Field label="Nome do exercício">
            <input className="input" value={exName} onChange={(e) => setExName(e.target.value)} placeholder="ex.: Elevação lateral" autoFocus />
          </Field>
          <button className="btn primary block" disabled={!exName.trim() || addExercise.isPending} onClick={() => addExercise.mutate(exName.trim())}>
            Adicionar (3×8–12)
          </button>
        </div>
      </Sheet>
      <Sheet open={!!noteFor} onClose={() => setNoteFor(null)} title={noteFor?.name ?? ''}>
        <div className="col">
          <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Execução, dor, ajuste de máquina…" />
          <button className="btn primary block" onClick={() => saveNote.mutate({ id: noteFor.id, notes: note })}>
            Salvar observação
          </button>
        </div>
      </Sheet>
    </>
  );
}
