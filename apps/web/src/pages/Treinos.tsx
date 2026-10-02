import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarClock, ChevronLeft, ChevronRight, Info, Plus, RefreshCw, XCircle } from 'lucide-react';
import { WEEKDAY_SHORT, addDays } from '@app/core';
import { api } from '../lib/api';
import { useAction, useApi } from '../lib/hooks';
import { ACTIVITY_COLOR, ACTIVITY_SHORT, dateLabel, n0, n1, shortDate } from '../lib/format';
import { Card, Disclaimer, Empty, Loading, Segmented, Sheet, Stat, useToast } from '../components/ui';
import { TopBar } from '../components/TopBar';
import { CompleteSheet, MoveSheet, NewActivitySheet } from '../components/WorkoutSheets';

export function Treinos() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as 'hoje' | 'semana' | 'historico') ?? 'hoje';
  return (
    <>
      <TopBar eyebrow="Treinos" title={tab === 'hoje' ? 'Treino de hoje' : tab === 'semana' ? 'Semana' : 'Histórico'} />
      <Segmented value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} options={[{ value: 'hoje', label: 'Hoje' }, { value: 'semana', label: 'Semana' }, { value: 'historico', label: 'Histórico' }]} />
      <div style={{ marginTop: 12 }}>{tab === 'hoje' ? <Today /> : tab === 'semana' ? <Week /> : <History />}</div>
    </>
  );
}

function sportEndFor(sessions: any[]): string | null {
  const s = sessions.filter((x) => x.type !== 'musculacao' && x.planned_time && x.status !== 'pulado').sort((a, b) => b.planned_time.localeCompare(a.planned_time))[0];
  if (!s) return null;
  const [h, m] = s.planned_time.split(':').map(Number);
  const t = h * 60 + m + (s.duration_min ?? 90) + 20;
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

function Today() {
  const q = useApi<any>('/api/workouts/today');
  const nav = useNavigate();
  const toast = useToast();
  const [move, setMove] = useState<any>(null);
  const [complete, setComplete] = useState<any>(null);
  const [skip, setSkip] = useState<any>(null);
  const [reason, setReason] = useState('');
  const [newAct, setNewAct] = useState(false);
  const start = useAction((id: number) => api.post(`/api/workouts/${id}/start`), { onSuccess: (w) => nav(`/treinos/${w.id}`) });
  const doSkip = useAction((v: { id: number; reason: string }) => api.post(`/api/workouts/${v.id}/skip`, { reason: v.reason || undefined }), {
    onSuccess: (r) => {
      setSkip(null);
      setReason('');
      toast(r.message ?? 'Semana reorganizada');
    },
  });

  if (q.isLoading || !q.data) return <Loading />;
  const { sessions, advice, next, date } = q.data;
  const ws = addDays(date, -((new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7));

  return (
    <>
      {sessions.length === 0 && (
        <Card>
          <Empty>
            Nada planejado para hoje.
            <br />
            Descanso também é treino.
          </Empty>
        </Card>
      )}
      {sessions.map((s: any) => {
        const isLift = s.type === 'musculacao';
        const color = ACTIVITY_COLOR[s.type];
        return (
          <Card key={s.id}>
            <div className="row between" style={{ marginBottom: 10 }}>
              <div className="row">
                <span className="swatch" style={{ background: color, width: 12, height: 12 }} />
                <div>
                  <h2>{isLift && s.template ? `${s.template.name}` : ACTIVITY_SHORT[s.type]}</h2>
                  <div className="small muted">
                    {isLift && s.template ? `${s.template.focus} · ` : ''}
                    {s.planned_time ?? 'horário livre'}
                    {s.optional ? ' · possível' : ''}
                  </div>
                </div>
              </div>
              {s.status === 'concluido' ? <span className="chip good">Concluído</span> : s.status === 'pulado' ? <span className="chip">Pulado</span> : s.status === 'em_andamento' ? <span className="chip accent">Em andamento</span> : null}
            </div>

            {isLift && s.status === 'planejado' && (
              <>
                {s.plan_reason?.length > 0 && (
                  <div className="xs sec row" style={{ alignItems: 'flex-start', marginBottom: 8 }}>
                    <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>{s.plan_reason.join(' ')}</span>
                  </div>
                )}
                {advice && (
                  <div className="insight" style={{ marginBottom: 10 }}>
                    <span>{advice.level === 'normal' ? '✅' : advice.level === 'reduzido' ? '⚠️' : '🛑'}</span>
                    <div className="small">
                      {advice.messages.map((m: string) => (
                        <div key={m}>{m}</div>
                      ))}
                      <div className="xs muted">RIR alvo: {advice.rir}</div>
                    </div>
                  </div>
                )}
                <div className="list">
                  {s.preview?.map((e: any, i: number) => {
                    const last = e.last?.filter((x: any) => x.completed);
                    return (
                      <div key={e.id} className="list-item" style={{ alignItems: 'flex-start' }}>
                        <span className="muted tabular small" style={{ width: 18 }}>{i + 1}</span>
                        <div className="grow">
                          <div style={{ fontWeight: 600 }}>{e.name}</div>
                          <div className="xs muted">
                            {e.sets} séries · {e.rep_min}–{e.rep_max} reps
                            {last?.length ? ` · última: ${last.map((x: any) => `${n1(x.weight_kg)}×${x.reps}`).slice(0, 4).join(', ')}` : ''}
                          </div>
                        </div>
                        {e.suggestion?.weight_kg != null && (
                          <span className="chip accent tabular" title={e.suggestion.reason}>
                            {n1(e.suggestion.weight_kg)} kg
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button className="btn primary lg block" style={{ marginTop: 12 }} disabled={start.isPending} onClick={() => start.mutate(s.id)}>
                  Iniciar treino
                </button>
              </>
            )}

            {isLift && s.status === 'em_andamento' && (
              <Link to={`/treinos/${s.id}`} className="btn primary lg block">
                Continuar treino
              </Link>
            )}

            {!isLift && s.status === 'planejado' && (
              <button className="btn primary block" onClick={() => setComplete(s)}>
                Registrar {ACTIVITY_SHORT[s.type].toLowerCase()}
              </button>
            )}

            {s.status === 'concluido' && (
              <Link to={`/treinos/${s.id}`} className="row small sec" style={{ gap: 12 }}>
                <span>{n0(s.duration_min)} min</span>
                <span>RPE {s.rpe}</span>
                {s.volume_kg ? <span>{n0(s.volume_kg)} kg de volume</span> : null}
                <ChevronRight size={16} style={{ marginLeft: 'auto' }} />
              </Link>
            )}

            {(s.status === 'planejado' || s.status === 'em_andamento') && (
              <div className="row" style={{ marginTop: 8 }}>
                {s.status === 'planejado' && (
                  <button className="btn sm ghost" onClick={() => setMove(s)}>
                    <CalendarClock size={16} /> Mudar horário
                  </button>
                )}
                <button className="btn sm ghost danger" onClick={() => setSkip(s)}>
                  <XCircle size={16} /> {isLift ? 'Não consegui treinar' : 'Não fui'}
                </button>
              </div>
            )}
          </Card>
        );
      })}

      <button className="btn block" style={{ marginTop: 12 }} onClick={() => setNewAct(true)}>
        <Plus size={18} /> Registrar atividade avulsa
      </button>

      {next?.length > 0 && (
        <>
          <div className="section-label">Próximas</div>
          <Card className="tight">
            <div className="list">
              {next.map((n: any, i: number) => (
                <div className="list-item" key={i}>
                  <span className="swatch" style={{ background: ACTIVITY_COLOR[n.type] }} />
                  <span className="grow">
                    {ACTIVITY_SHORT[n.type]}
                    {n.template_code ? ` ${n.template_code}` : ''}
                  </span>
                  <span className="small muted">
                    {dateLabel(n.date, { weekday: true })} {n.planned_time ?? ''}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      <MoveSheet open={!!move} onClose={() => setMove(null)} workout={move} weekStart={ws} sportEnd={sportEndFor(sessions)} />
      <CompleteSheet open={!!complete} onClose={() => setComplete(null)} workout={complete} />
      <NewActivitySheet
        open={newAct}
        onClose={() => setNewAct(false)}
        date={date}
        onCreated={(w) => (w.type === 'musculacao' ? nav(`/treinos/${w.id}`) : setComplete(w))}
      />
      <Sheet open={!!skip} onClose={() => setSkip(null)} title={skip?.type === 'musculacao' ? 'Não consegui treinar' : 'Marcar como não realizado'}>
        <div className="col">
          <p className="small sec" style={{ margin: 0 }}>
            {skip?.type === 'musculacao'
              ? 'A sessão será marcada como pulada e o restante da semana será reorganizado — sem empilhar dois treinos no mesmo dia. Se não houver encaixe seguro, ela fica para a próxima semana.'
              : 'A sessão será marcada como não realizada. A musculação dos próximos dias será reavaliada.'}
          </p>
          <input className="input" placeholder="Motivo (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn primary block" disabled={doSkip.isPending} onClick={() => doSkip.mutate({ id: skip.id, reason })}>
            Confirmar
          </button>
        </div>
      </Sheet>
    </>
  );
}

function Week() {
  const [date, setDate] = useState<string | undefined>();
  const q = useApi<any>(`/api/plan/week${date ? `?date=${date}` : ''}`);
  const toast = useToast();
  const replan = useAction(() => api.post('/api/plan/replan', {}), {
    onSuccess: (r) => toast(r.dropped?.length ? r.dropped.map((d: any) => d.reason).join(' ') : 'Musculação replanejada para o restante da semana'),
  });
  if (q.isLoading || !q.data) return <Loading />;
  const { weekStart, sessions, today } = q.data;
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  return (
    <>
      <div className="row between" style={{ marginBottom: 8 }}>
        <button className="icon-btn" onClick={() => setDate(addDays(weekStart, -7))} aria-label="Semana anterior">
          <ChevronLeft size={18} />
        </button>
        <b className="small">
          {shortDate(weekStart)} – {shortDate(addDays(weekStart, 6))}
        </b>
        <button className="icon-btn" onClick={() => setDate(addDays(weekStart, 7))} aria-label="Próxima semana">
          <ChevronRight size={18} />
        </button>
      </div>
      <Card className="tight">
        <div className="list">
          {days.map((d) => {
            const list = sessions.filter((s: any) => s.date === d);
            return (
              <div key={d} className="list-item" style={{ alignItems: 'flex-start', background: d === today ? 'var(--accent-soft)' : undefined, margin: '0 -12px', padding: '12px' }}>
                <div style={{ width: 44 }}>
                  <div className="xs muted" style={{ textTransform: 'uppercase', fontWeight: 650 }}>{WEEKDAY_SHORT[new Date(d + 'T12:00:00Z').getUTCDay()]}</div>
                  <div className="tabular" style={{ fontWeight: 700 }}>{d.slice(8)}</div>
                </div>
                <div className="grow col" style={{ gap: 6 }}>
                  {list.length === 0 && <span className="small muted">Descanso / livre</span>}
                  {list.map((s: any) => (
                    <Link to={`/treinos/${s.id}`} key={s.id} className="row" style={{ color: 'inherit', opacity: s.status === 'pulado' ? 0.5 : 1 }}>
                      <span className="swatch" style={{ background: ACTIVITY_COLOR[s.type] }} />
                      <span className="grow small" style={{ textDecoration: s.status === 'pulado' ? 'line-through' : undefined }}>
                        <b>
                          {ACTIVITY_SHORT[s.type]}
                          {s.template_code ? ` ${s.template_code}` : ''}
                        </b>{' '}
                        <span className="muted">
                          {s.planned_time ?? ''}
                          {s.optional ? ' · possível' : ''}
                          {s.locked && s.type === 'musculacao' ? ' · fixado' : ''}
                        </span>
                        {s.plan_reason?.length > 0 && s.status === 'planejado' && <div className="xs muted">{s.plan_reason[0]}</div>}
                      </span>
                      {s.status === 'concluido' && <span className="chip good">✓</span>}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      {weekStart <= today && addDays(weekStart, 6) >= today && (
        <button className="btn block" style={{ marginTop: 12 }} disabled={replan.isPending} onClick={() => replan.mutate(undefined)}>
          <RefreshCw size={16} /> Replanejar musculação da semana
        </button>
      )}
      <Disclaimer>
        O plano evita pernas pesadas antes de jogos e na véspera deles, espaça as sessões e respeita sua recuperação do dia. Os pesos dessa lógica são heurísticos — ajuste dias e horários livremente.
      </Disclaimer>
    </>
  );
}

function History() {
  const [month, setMonth] = useState<string | undefined>();
  const [sel, setSel] = useState<string | null>(null);
  const q = useApi<any>(`/api/history${month ? `?month=${month}` : ''}`);
  const cells = useMemo(() => {
    if (!q.data) return [];
    const { start, end } = q.data;
    const lead = (new Date(start + 'T12:00:00Z').getUTCDay() + 6) % 7;
    const out: (string | null)[] = Array(lead).fill(null);
    for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
    return out;
  }, [q.data]);
  if (q.isLoading || !q.data) return <Loading />;
  const h = q.data;
  const [y, m] = h.month.split('-').map(Number);
  const shift = (k: number) => {
    const d = new Date(Date.UTC(y, m - 1 + k, 1));
    setMonth(d.toISOString().slice(0, 7));
    setSel(null);
  };
  const today: string = h.today;
  const monthName = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const selSessions = sel ? h.days[sel] ?? [] : [];
  return (
    <>
      <Card>
        <div className="row between" style={{ marginBottom: 12 }}>
          <button className="icon-btn" onClick={() => shift(-1)} aria-label="Mês anterior">
            <ChevronLeft size={18} />
          </button>
          <b style={{ textTransform: 'capitalize' }}>{monthName}</b>
          <button className="icon-btn" onClick={() => shift(1)} aria-label="Próximo mês">
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="cal">
          {['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((d) => (
            <div className="dow" key={d}>{d}</div>
          ))}
          {cells.map((d, i) =>
            d ? (
              <button key={d} className={`day ${d === today ? 'today' : ''} ${d === sel ? 'sel' : ''}`} onClick={() => setSel(d)} aria-label={dateLabel(d, { weekday: true })}>
                <span className="tabular">{Number(d.slice(8))}</span>
                <span className="dots">
                  {(h.days[d] ?? [])
                    .filter((s: any) => s.status === 'concluido' || s.status === 'pulado' || d >= today)
                    .map((s: any) => (
                      <i key={s.id} className={s.status === 'pulado' ? 'skip' : ''} style={{ background: s.status === 'concluido' ? ACTIVITY_COLOR[s.type] : s.status === 'planejado' ? 'var(--axis)' : undefined }} />
                    ))}
                </span>
              </button>
            ) : (
              <div key={`e${i}`} className="day empty" />
            ),
          )}
        </div>
        <div className="legend" style={{ marginTop: 12 }}>
          {['musculacao', 'futevolei', 'tenis', 'recuperacao'].map((t) => (
            <span key={t}>
              <i className="swatch" style={{ background: ACTIVITY_COLOR[t] }} /> {ACTIVITY_SHORT[t]}
            </span>
          ))}
          <span>
            <i className="swatch" style={{ boxShadow: 'inset 0 0 0 1.5px var(--text-muted)' }} /> Pulado
          </span>
          <span>
            <i className="swatch" style={{ background: 'var(--axis)' }} /> Planejado
          </span>
        </div>
      </Card>

      {sel && (
        <Card title={dateLabel(sel, { weekday: true })}>
          {selSessions.length === 0 ? (
            <p className="small muted" style={{ margin: 0 }}>Descanso.</p>
          ) : (
            <div className="list">
              {selSessions.map((s: any) => (
                <Link to={`/treinos/${s.id}`} key={s.id} className="list-item clickable" style={{ color: 'inherit' }}>
                  <span className="bar-v" style={{ background: ACTIVITY_COLOR[s.type] }} />
                  <div className="grow">
                    <b>
                      {ACTIVITY_SHORT[s.type]}
                      {s.template_code ? ` ${s.template_code}` : ''}
                    </b>
                    <div className="xs muted">
                      {s.status === 'concluido'
                        ? [s.duration_min && `${n0(s.duration_min)} min`, s.rpe && `RPE ${s.rpe}`, s.volume_kg && `${n0(s.volume_kg)} kg`, s.calories && `${n0(s.calories)} kcal`].filter(Boolean).join(' · ')
                        : s.status}
                    </div>
                  </div>
                  <ChevronRight size={16} />
                </Link>
              ))}
            </div>
          )}
        </Card>
      )}

      <div className="section-label">Estatísticas do mês</div>
      <div className="grid2">
        <Stat label="Treinos realizados" value={h.stats.total} sub={`${h.stats.musculacao} musc. · ${h.stats.futevolei} futv. · ${h.stats.tenis} tênis`} />
        <Stat label="Frequência semanal" value={n1(h.stats.perWeek)} unit="/sem" />
        <Stat label="Volume de musculação" value={n0(h.stats.liftVolume)} unit="kg" sub="carga × reps" />
        <Stat label="Sequência atual" value={h.streak.days} unit="dias" sub={`RPE médio ${n1(h.stats.avgRpe)}`} />
      </div>

      <Card title="Volume semanal de musculação" className="" >
        <div style={{ height: 180 }} role="img" aria-label="Volume semanal de musculação nas últimas 8 semanas">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={h.weeklyVolume} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis dataKey="weekStart" tickFormatter={shortDate} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={{ stroke: 'var(--axis)' }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
              <Tooltip
                cursor={{ fill: 'var(--surface-2)' }}
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <div className="chart-tip">
                      <b>Semana de {shortDate(payload[0].payload.weekStart)}</b>
                      <div>{n0(payload[0].payload.volume)} kg · {payload[0].payload.sessions} sessões</div>
                    </div>
                  ) : null
                }
              />
              <Bar dataKey="volume" fill="var(--c-lift)" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </>
  );
}
