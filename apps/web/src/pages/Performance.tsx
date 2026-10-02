import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronLeft, ChevronRight, Plus, Trash2, Trophy } from 'lucide-react';
import { addDays } from '@app/core';
import { api } from '../lib/api';
import { useAction, useApi } from '../lib/hooks';
import { ACTIVITY_COLOR, dateLabel, n0, n1, shortDate, signed } from '../lib/format';
import { Card, Disclaimer, Empty, Field, Loading, NumInput, Segmented, Sheet, Stat } from '../components/ui';
import { TopBar } from '../components/TopBar';

type Tab = 'forca' | 'esportes' | 'carga' | 'relatorio' | 'metas';

export function Performance() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) ?? 'forca';
  const titles: Record<Tab, string> = { forca: 'Musculação', esportes: 'Esportes', carga: 'Carga de treino', relatorio: 'Resumo da semana', metas: 'Metas' };
  return (
    <>
      <TopBar eyebrow="Performance" title={titles[tab]} />
      <Segmented
        value={tab}
        onChange={(t) => setParams({ tab: t }, { replace: true })}
        options={[
          { value: 'forca', label: 'Força' },
          { value: 'esportes', label: 'Esportes' },
          { value: 'carga', label: 'Carga' },
          { value: 'relatorio', label: 'Semana' },
          { value: 'metas', label: 'Metas' },
        ]}
      />
      <div style={{ marginTop: 12 }}>
        {tab === 'forca' ? <Strength /> : tab === 'esportes' ? <Sports /> : tab === 'carga' ? <Load /> : tab === 'relatorio' ? <Report /> : <Goals />}
      </div>
    </>
  );
}

function Strength() {
  const list = useApi<any[]>('/api/performance/exercises');
  const [sel, setSel] = useState<string | null>(null);
  const name = sel ?? list.data?.[0]?.name ?? null;
  const detail = useApi<any>(name ? `/api/performance/exercise?name=${encodeURIComponent(name)}` : null);
  if (list.isLoading || !list.data) return <Loading />;
  if (!list.data.length) return <Card><Empty>Conclua treinos de musculação para ver a evolução de cargas e recordes.</Empty></Card>;
  const prog = detail.data?.progression ?? [];
  return (
    <>
      <Card title={name} action={<span className="chip">{prog.length} sessões</span>}>
        {prog.length < 2 ? (
          <Empty>São necessárias pelo menos 2 sessões deste exercício.</Empty>
        ) : (
          <>
            <div style={{ height: 200 }} role="img" aria-label={`Evolução de carga em ${name}`}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={prog} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--grid)" />
                  <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={{ stroke: 'var(--axis)' }} tickLine={false} minTickGap={20} />
                  <YAxis domain={['dataMin - 5', 'dataMax + 5']} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    content={({ active, payload }) =>
                      active && payload?.length ? (
                        <div className="chart-tip">
                          <b>{dateLabel(payload[0].payload.date)}</b>
                          <div>Melhor série: {n1(payload[0].payload.top_weight)} kg × {payload[0].payload.top_reps}</div>
                          <div>1RM estimado: {n1(payload[0].payload.e1rm)} kg</div>
                          {payload[0].payload.isPR && <div>🏆 Recorde</div>}
                        </div>
                      ) : null
                    }
                  />
                  <Line dataKey="e1rm" name="1RM estimado" stroke="var(--c-lift)" strokeWidth={2} dot={(p: any) => <circle key={p.index} cx={p.cx} cy={p.cy} r={p.payload.isPR ? 5 : 3} fill={p.payload.isPR ? 'var(--warn)' : 'var(--c-lift)'} stroke="var(--surface)" strokeWidth={2} />} isAnimationActive={false} />
                  <Line dataKey="top_weight" name="Carga máxima" stroke="var(--c-futevolei)" strokeWidth={2} dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="legend" style={{ marginTop: 8 }}>
              <span><i className="swatch" style={{ background: 'var(--c-lift)' }} /> 1RM estimado (Epley)</span>
              <span><i className="swatch" style={{ background: 'var(--c-futevolei)' }} /> Carga máxima usada</span>
              <span><i className="swatch" style={{ background: 'var(--warn)' }} /> Recorde</span>
            </div>
          </>
        )}
        <Disclaimer>1RM estimado é uma conta (Epley), não um teste. Serve para comparar sessões com repetições diferentes.</Disclaimer>
      </Card>
      <Card title="Exercícios">
        <div className="list">
          {list.data.map((e) => (
            <button key={e.name} className="list-item clickable" onClick={() => setSel(e.name)} style={{ background: e.name === name ? 'var(--accent-soft)' : 'none', border: 0, borderTop: '1px solid var(--border)', width: '100%', textAlign: 'left', margin: '0 -8px', padding: '10px 8px' }}>
              <div className="grow">
                <b className="small">{e.name}</b>
                <div className="xs muted tabular">
                  Última: {n1(e.last?.top_weight)} kg × {e.last?.top_reps} · melhor 1RM est. {n1(e.best?.e1rm ?? e.best?.top_weight)} kg
                </div>
              </div>
              {e.prs > 0 && (
                <span className="chip">
                  <Trophy size={12} /> {e.prs}
                </span>
              )}
            </button>
          ))}
        </div>
      </Card>
    </>
  );
}

function Sports() {
  const [type, setType] = useState<'tenis' | 'futevolei'>('tenis');
  const q = useApi<any>(`/api/performance/sports?type=${type}`);
  return (
    <>
      <Segmented value={type} onChange={setType} options={[{ value: 'tenis', label: 'Tênis' }, { value: 'futevolei', label: 'Futvôlei' }]} />
      {!q.data ? (
        <Loading />
      ) : (
        <>
          <div className="grid2" style={{ marginTop: 12 }}>
            <Stat label="Sessões (30 dias)" value={q.data.summary.count30} sub={`${n0(q.data.summary.minutes30)} min no total`} />
            <Stat label="RPE médio" value={n1(q.data.summary.avgRpe30)} unit="/10" />
            <Stat label="Desempenho médio" value={n1(q.data.summary.avgRating30)} unit="/5" sub="autoavaliação" />
            <Stat label={type === 'tenis' ? 'Partidas/sets' : 'Jogos'} value={q.data.summary.games30} />
          </div>
          <Card title="Sessões">
            {q.data.sessions.length === 0 ? (
              <Empty>Nenhuma sessão registrada.</Empty>
            ) : (
              <div className="list">
                {q.data.sessions.map((s: any) => (
                  <div key={s.id} className="list-item" style={{ alignItems: 'flex-start' }}>
                    <span className="bar-v" style={{ background: ACTIVITY_COLOR[type] }} />
                    <div className="grow">
                      <b className="small">{dateLabel(s.date, { weekday: true })}</b>
                      <div className="xs muted">
                        {[s.duration_min && `${n0(s.duration_min)} min`, s.rpe && `RPE ${s.rpe}`, s.intensity, s.games != null && `${s.games} jogos`, s.performance_rating && `desempenho ${s.performance_rating}/5`].filter(Boolean).join(' · ')}
                      </div>
                      {s.notes && <div className="xs sec">{s.notes}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}

const LOAD_SERIES = [
  { key: 'musculacao', label: 'Musculação', color: 'var(--c-lift)' },
  { key: 'futevolei', label: 'Futvôlei', color: 'var(--c-futevolei)' },
  { key: 'tenis', label: 'Tênis', color: 'var(--c-tenis)' },
  { key: 'outros', label: 'Outros', color: 'var(--c-recovery)' },
];

function Load() {
  const q = useApi<any>('/api/performance/load?weeks=8');
  const dash = useApi<any>('/api/dashboard');
  if (!q.data) return <Loading />;
  const lt = dash.data?.load;
  return (
    <>
      {lt && (
        <div className="grid2">
          <Stat label="Últimos 7 dias" value={n0(lt.current)} unit="UA" />
          <Stat label="Média 3 semanas" value={lt.baseline != null ? n0(lt.baseline) : '–'} unit="UA" sub={lt.ratio ? `${Math.round(lt.ratio * 100)}% do habitual` : 'histórico insuficiente'} />
        </div>
      )}
      <Card title="Carga semanal por modalidade">
        <div style={{ height: 220 }} role="img" aria-label="Carga semanal empilhada por modalidade">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={q.data.weeks} margin={{ top: 6, right: 4, left: -12, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis dataKey="weekStart" tickFormatter={shortDate} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={{ stroke: 'var(--axis)' }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: 'var(--surface-2)' }}
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <div className="chart-tip">
                      <b>Semana de {shortDate(payload[0].payload.weekStart)}</b>
                      {LOAD_SERIES.map((s) => (
                        <div key={s.key} className="row" style={{ gap: 6 }}>
                          <i className="swatch" style={{ background: s.color }} /> {s.label}: {n0(payload[0].payload[s.key])}
                        </div>
                      ))}
                    </div>
                  ) : null
                }
              />
              {LOAD_SERIES.map((s, i) => (
                <Bar key={s.key} dataKey={s.key} stackId="a" fill={s.color} stroke="var(--surface)" strokeWidth={1} radius={i === LOAD_SERIES.length - 1 ? [4, 4, 0, 0] : undefined} maxBarSize={30} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="legend" style={{ marginTop: 8 }}>
          {LOAD_SERIES.map((s) => (
            <span key={s.key}><i className="swatch" style={{ background: s.color }} /> {s.label}</span>
          ))}
        </div>
        <Disclaimer>Carga interna = RPE × minutos (session-RPE). É uma medida relativa: compare você com você mesmo. Saltos acima de ~30% em relação à média recente pedem cautela.</Disclaimer>
      </Card>
    </>
  );
}

function Report() {
  const [week, setWeek] = useState<string | null>(null);
  const q = useApi<any>(`/api/reports/weekly${week ? `?week=${week}` : ''}`);
  if (!q.data) return <Loading />;
  const r = q.data;
  const t = r.training;
  if (r.noData)
    return (
      <>
        <div className="row between" style={{ marginBottom: 8 }}>
          <button className="icon-btn" onClick={() => setWeek(addDays(r.weekStart, -7))} aria-label="Semana anterior"><ChevronLeft size={18} /></button>
          <b className="small">{shortDate(r.weekStart)} – {shortDate(r.weekEnd)}</b>
          <button className="icon-btn" onClick={() => setWeek(addDays(r.weekStart, 7))} aria-label="Próxima semana"><ChevronRight size={18} /></button>
        </div>
        <Card><Empty>{r.message}</Empty></Card>
      </>
    );
  return (
    <>
      <div className="row between" style={{ marginBottom: 8 }}>
        <button className="icon-btn" onClick={() => setWeek(addDays(r.weekStart, -7))} aria-label="Semana anterior"><ChevronLeft size={18} /></button>
        <b className="small">{shortDate(r.weekStart)} – {shortDate(r.weekEnd)}{!r.isComplete ? ' (em andamento)' : ''}</b>
        <button className="icon-btn" onClick={() => setWeek(addDays(r.weekStart, 7))} aria-label="Próxima semana"><ChevronRight size={18} /></button>
      </div>
      <Card>
        <div className="xs muted" style={{ fontWeight: 650, letterSpacing: '0.06em' }}>RESUMO</div>
        <p style={{ margin: '6px 0 0', fontSize: 16, fontWeight: 550 }}>{r.summary}</p>
      </Card>
      <div className="grid2" style={{ marginTop: 12 }}>
        <Stat label="Peso médio" value={n1(r.weight.avg)} unit="kg" sub={r.weight.prevAvg != null ? `anterior ${n1(r.weight.prevAvg)} · ${signed(r.weight.change)} kg` : `${r.weight.weighIns} pesagens`} />
        <Stat label="Proteína média" value={n0(r.nutrition.avgProtein)} unit="g/dia" sub={`meta ${r.nutrition.proteinTarget} g`} />
        <Stat label="Calorias médias" value={n0(r.nutrition.avgCalories)} unit="kcal" sub={`meta ${n0(r.nutrition.calorieTarget)} · ${r.nutrition.daysLogged}/7 dias`} />
        <Stat label="Adesão alimentar" value={`${r.nutrition.dietAdherence}%`} sub="kcal ±10% e proteína ≥90%" />
        <Stat label="Musculação" value={`${t.lifts.done}/${t.lifts.planned}`} sub={`volume ${n0(t.liftVolume)} kg${t.prevLiftVolume ? ` (ant. ${n0(t.prevLiftVolume)})` : ''}`} />
        <Stat label="Futvôlei · Tênis" value={`${t.futevolei.done}/${t.futevolei.planned} · ${t.tenis.done}/${t.tenis.planned}`} />
        <Stat label="Performance" value={r.performance.arrow} sub={r.performance.trend ? `força ${r.performance.trend}` : 'dados insuficientes'} />
        <Stat label="Recuperação" value={r.recovery.label ?? '–'} sub={r.recovery.avgSleep ? `sono médio ${n1(r.recovery.avgSleep)} h` : 'sem check-ins'} />
      </div>
      {r.performance.prs.length > 0 && (
        <Card title="Recordes da semana" icon={<Trophy size={18} />}>
          {r.performance.prs.map((p: any) => (
            <div key={p.exercise} className="small">{p.exercise}: <b>{n1(p.weight)} kg × {p.reps}</b></div>
          ))}
        </Card>
      )}
      {r.attention.length > 0 && (
        <Card title="Pontos de atenção">
          <ul style={{ margin: 0, paddingLeft: 18 }} className="small">
            {r.attention.map((a: string) => <li key={a}>{a}</li>)}
          </ul>
        </Card>
      )}
      <Disclaimer>{r.definitions.dietAdherence} {r.definitions.weight} O resumo só afirma o que os registros sustentam.</Disclaimer>
    </>
  );
}

const HORIZON_LABEL: Record<string, string> = { curto: 'Curto prazo', medio: 'Médio prazo', longo: 'Longo prazo' };

function Goals() {
  const q = useApi<any>('/api/goals');
  const [add, setAdd] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [val, setVal] = useState<number | null>(null);
  const del = useAction((id: number) => api.del(`/api/goals/${id}`), { success: 'Meta removida' });
  const patch = useAction((b: any) => api.patch(`/api/goals/${b.id}`, b), { success: 'Meta atualizada', onSuccess: () => setEdit(null) });
  if (!q.data) return <Loading />;
  const goals = q.data.goals;
  return (
    <>
      {(['curto', 'medio', 'longo'] as const).map((h) => (
        <div key={h}>
          <div className="section-label">{HORIZON_LABEL[h]}</div>
          <Card>
            {goals.filter((g: any) => g.horizon === h).length === 0 && <Empty>Nenhuma meta.</Empty>}
            <div className="col" style={{ gap: 14 }}>
              {goals
                .filter((g: any) => g.horizon === h)
                .map((g: any) => (
                  <button key={g.id} onClick={() => { setEdit(g); setVal(g.kind === 'manual' ? g.current_manual : g.target_value); }} style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer' }}>
                    <div className="row between">
                      <span className="small" style={{ fontWeight: 600 }}>{g.title}</span>
                      <span className="small tabular" style={{ fontWeight: 700 }}>{g.pct == null ? '–' : `${g.pct}%`}</span>
                    </div>
                    <div className="bar" style={{ margin: '6px 0 4px' }}>
                      <span style={{ width: `${g.pct ?? 0}%`, background: g.pct >= 100 ? 'var(--good)' : 'var(--accent)' }} />
                    </div>
                    <div className="xs muted tabular">
                      {g.pct == null
                        ? 'Precisa de um valor inicial (registre a medida ou defina na meta).'
                        : `Atual: ${g.current != null ? n1(g.current) : '–'} ${g.unit ?? ''} · alvo ${n1(g.target_value)} ${g.unit ?? ''}${g.start_value != null ? ` · início ${n1(g.start_value)}` : ''}`}
                    </div>
                  </button>
                ))}
            </div>
          </Card>
        </div>
      ))}
      <button className="btn block" style={{ marginTop: 12 }} onClick={() => setAdd(true)}>
        <Plus size={16} /> Nova meta
      </button>
      <NewGoalSheet open={add} onClose={() => setAdd(false)} kinds={q.data.kinds} />
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.title ?? ''}>
        {edit && (
          <div className="col">
            <Field label={edit.kind === 'manual' ? 'Progresso atual' : 'Alvo'}>
              <NumInput value={val} onChange={setVal} />
            </Field>
            <div className="row">
              <button className="btn danger" onClick={() => { del.mutate(edit.id); setEdit(null); }}>
                <Trash2 size={16} /> Excluir
              </button>
              <button className="btn primary grow" disabled={val == null} onClick={() => patch.mutate(edit.kind === 'manual' ? { id: edit.id, current_manual: val } : { id: edit.id, target_value: val })}>
                Salvar
              </button>
            </div>
          </div>
        )}
      </Sheet>
    </>
  );
}

function NewGoalSheet({ open, onClose, kinds }: { open: boolean; onClose: () => void; kinds: Record<string, string> }) {
  const [f, setF] = useState<any>({ horizon: 'medio', kind: 'carga_exercicio', title: '', target_value: null, start_value: null, exercise_name: '', unit: '' });
  const exercises = useApi<any[]>(open ? '/api/performance/exercises' : null);
  const save = useAction((b: any) => api.post('/api/goals', b), { success: 'Meta criada', onSuccess: onClose });
  return (
    <Sheet open={open} onClose={onClose} title="Nova meta">
      <div className="col">
        <Segmented value={f.horizon} onChange={(v) => setF({ ...f, horizon: v })} options={[{ value: 'curto', label: 'Curto' }, { value: 'medio', label: 'Médio' }, { value: 'longo', label: 'Longo' }]} />
        <Field label="Tipo">
          <select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
            {Object.entries(kinds).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Título">
          <input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="ex.: Supino 80 kg" />
        </Field>
        {f.kind === 'carga_exercicio' && (
          <Field label="Exercício">
            <select className="input" value={f.exercise_name} onChange={(e) => setF({ ...f, exercise_name: e.target.value })}>
              <option value="">Selecione</option>
              {exercises.data?.map((e) => <option key={e.name}>{e.name}</option>)}
            </select>
          </Field>
        )}
        <div className="grid2">
          <Field label="Alvo">
            <NumInput value={f.target_value} onChange={(v) => setF({ ...f, target_value: v })} />
          </Field>
          {['peso_alvo', 'cintura_alvo', 'carga_exercicio'].includes(f.kind) && (
            <Field label="Valor inicial">
              <NumInput value={f.start_value} onChange={(v) => setF({ ...f, start_value: v })} placeholder="auto" />
            </Field>
          )}
        </div>
        <button
          className="btn primary block"
          disabled={!f.title.trim() || f.target_value == null || (f.kind === 'carga_exercicio' && !f.exercise_name) || save.isPending}
          onClick={() => save.mutate({ ...f, exercise_name: f.exercise_name || null, unit: f.unit || null })}
        >
          Criar meta
        </button>
      </div>
    </Sheet>
  );
}
