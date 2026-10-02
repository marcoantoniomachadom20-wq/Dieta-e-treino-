import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts';
import { Camera, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { prepareImage } from '../lib/image';
import { useAction, useApi } from '../lib/hooks';
import { dateLabel, n1, shortDate, signed } from '../lib/format';
import { Card, Disclaimer, Empty, Field, Loading, NumInput, Segmented, Stat, useToast } from '../components/ui';
import { TopBar } from '../components/TopBar';

export function Evolucao() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'peso';
  const dash = useApi<any>('/api/dashboard');
  const today = dash.data?.date;
  return (
    <>
      <TopBar eyebrow="Evolução" title={tab === 'peso' ? 'Peso' : tab === 'medidas' ? 'Medidas' : 'Fotos'} />
      <Segmented value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} options={[{ value: 'peso', label: 'Peso' }, { value: 'medidas', label: 'Medidas' }, { value: 'fotos', label: 'Fotos' }]} />
      <div style={{ marginTop: 12 }}>{!today ? <Loading /> : tab === 'peso' ? <Weight today={today} /> : tab === 'medidas' ? <Measures today={today} /> : <Photos today={today} />}</div>
    </>
  );
}

function Weight({ today }: { today: string }) {
  const q = useApi<any>('/api/weight');
  const toast = useToast();
  const [date, setDate] = useState(today);
  const [w, setW] = useState<number | null>(null);
  const [range, setRange] = useState<'30' | '90' | 'all'>('90');
  const save = useAction((b: any) => api.post('/api/weight', b), {
    onSuccess: (r) => {
      toast(r.warning ?? 'Peso registrado', !!r.warning);
      setW(null);
    },
  });
  const del = useAction((id: number) => api.del(`/api/weight/${id}`), { success: 'Pesagem removida' });
  const series = useMemo(() => {
    const s = q.data?.series ?? [];
    if (range === 'all') return s;
    const from = new Date(Date.parse(today) - Number(range) * 86400000).toISOString().slice(0, 10);
    return s.filter((p: any) => p.date >= from);
  }, [q.data, range, today]);
  if (q.isLoading || !q.data) return <Loading />;
  const st = q.data.stats;
  const domain = series.length ? [Math.floor(Math.min(...series.map((p: any) => p.weight)) - 0.5), Math.ceil(Math.max(...series.map((p: any) => p.weight)) + 0.5)] : ['auto', 'auto'];

  return (
    <>
      <Card>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <Field label="Peso (kg)">
            <NumInput value={w} onChange={setW} placeholder={st.current ? n1(st.current) : '75,0'} />
          </Field>
          <Field label="Data">
            <input className="input" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <button className="btn primary block" style={{ marginTop: 10 }} disabled={!w || save.isPending} onClick={() => save.mutate({ date, weight_kg: w })}>
          Registrar peso
        </button>
        <p className="xs muted" style={{ marginBottom: 0 }}>Pese-se ao acordar, após ir ao banheiro, antes de comer. Mesmo horário todo dia.</p>
      </Card>

      <div className="grid2" style={{ marginTop: 12 }}>
        <Stat label="Média 7 dias" value={n1(st.avg7)} unit="kg" sub="o número que importa" />
        <Stat label="Média 30 dias" value={n1(st.avg30)} unit="kg" />
        <Stat label="Atual" value={n1(st.current)} unit="kg" sub={st.currentDate ? dateLabel(st.currentDate) : ''} />
        <Stat label="Desde o início" value={signed(st.changeFromStartAvg ?? st.changeFromStart)} unit="kg" sub={`inicial ${n1(st.initial)} kg`} />
        <Stat label="Menor" value={n1(st.min)} unit="kg" />
        <Stat label="Maior" value={n1(st.max)} unit="kg" />
      </div>
      {st.rate && (
        <Card className="tight">
          <span className="small">
            Tendência (4 semanas): <b className="tabular">{signed(st.rate.kgPerWeek, 1)} kg/semana</b> <span className="muted">({signed(st.rate.pctPerWeek, 1)}% do peso)</span>
          </span>
        </Card>
      )}

      <Card title="Evolução" action={<Segmented value={range} onChange={setRange} options={[{ value: '30', label: '30d' }, { value: '90', label: '90d' }, { value: 'all', label: 'Tudo' }]} />}>
        {series.length < 2 ? (
          <Empty>Registre pelo menos duas pesagens para ver o gráfico.</Empty>
        ) : (
          <>
            <div style={{ height: 220 }} role="img" aria-label="Gráfico de peso diário e média móvel de 7 dias">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={series} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--grid)" />
                  <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={{ stroke: 'var(--axis)' }} tickLine={false} minTickGap={24} />
                  <YAxis domain={domain as any} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    cursor={{ stroke: 'var(--axis)' }}
                    content={({ active, payload }) =>
                      active && payload?.length ? (
                        <div className="chart-tip">
                          <b>{dateLabel(payload[0].payload.date, { weekday: true })}</b>
                          <div>Pesagem: {n1(payload[0].payload.weight)} kg</div>
                          <div>Média 7d: {n1(payload[0].payload.avg7)} kg</div>
                        </div>
                      ) : null
                    }
                  />
                  <Scatter dataKey="weight" fill="var(--c-kcal)" fillOpacity={0.45} shape={(p: any) => <circle cx={p.cx} cy={p.cy} r={3} fill="var(--c-kcal)" fillOpacity={0.45} />} />
                  <Line dataKey="avg7" stroke="var(--c-avg)" strokeWidth={2} dot={false} type="monotone" isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="legend" style={{ marginTop: 8 }}>
              <span>
                <i className="swatch" style={{ background: 'var(--c-kcal)', opacity: 0.6 }} /> Pesagem do dia
              </span>
              <span>
                <i style={{ width: 14, height: 2, background: 'var(--c-avg)', display: 'inline-block' }} /> Média móvel 7 dias
              </span>
            </div>
          </>
        )}
        <Disclaimer>Variações de 0,5–1,5 kg de um dia para o outro são normais (água, sal, carboidrato, intestino, treino). Decida pela média, nunca pela pesagem isolada.</Disclaimer>
      </Card>

      <Card title="Registros">
        <div className="list">
          {[...q.data.entries].reverse().slice(0, 30).map((e: any) => (
            <div key={e.id} className="list-item">
              <span className="grow small">{dateLabel(e.date, { weekday: true, year: true })}</span>
              <b className="tabular">{n1(e.weight_kg)} kg</b>
              <button className="icon-btn" style={{ border: 0, background: 'none' }} onClick={() => confirm('Remover esta pesagem?') && del.mutate(e.id)} aria-label="Remover pesagem">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

const MEASURES = [
  { key: 'waist', label: 'Cintura' },
  { key: 'abdomen', label: 'Abdômen' },
  { key: 'chest', label: 'Peito' },
  { key: 'arm', label: 'Braço' },
  { key: 'thigh', label: 'Coxa' },
  { key: 'body_fat', label: '% gordura' },
] as const;

function Measures({ today }: { today: string }) {
  const q = useApi<any[]>('/api/measurements');
  const [f, setF] = useState<any>({ date: today });
  const [metric, setMetric] = useState<string>('waist');
  const save = useAction((b: any) => api.post('/api/measurements', b), { success: 'Medidas salvas', onSuccess: () => setF({ date: today }) });
  const del = useAction((id: number) => api.del(`/api/measurements/${id}`), { success: 'Removido' });
  if (q.isLoading || !q.data) return <Loading />;
  const data = q.data.filter((m: any) => m[metric] != null);
  const first = data[0]?.[metric];
  const last = data.at(-1)?.[metric];
  return (
    <>
      <Card title="Nova medição">
        <div className="grid3">
          {MEASURES.slice(0, 5).map((m) => (
            <Field key={m.key} label={`${m.label} (cm)`}>
              <NumInput value={f[m.key] ?? null} onChange={(v) => setF({ ...f, [m.key]: v })} />
            </Field>
          ))}
          <Field label="% gordura">
            <NumInput value={f.body_fat ?? null} onChange={(v) => setF({ ...f, body_fat: v })} placeholder="opcional" />
          </Field>
        </div>
        {f.body_fat != null && (
          <Field label="Método da medição de gordura">
            <select className="input" value={f.body_fat_method ?? ''} onChange={(e) => setF({ ...f, body_fat_method: e.target.value || null })}>
              <option value="">Selecione</option>
              <option>DEXA</option>
              <option>Bioimpedância (balança/aparelho)</option>
              <option>Dobras cutâneas (profissional)</option>
              <option>Outro</option>
            </select>
          </Field>
        )}
        <div className="row" style={{ marginTop: 10 }}>
          <input className="input" type="date" value={f.date} max={today} onChange={(e) => setF({ ...f, date: e.target.value })} style={{ maxWidth: 170 }} />
          <button className="btn primary grow" disabled={save.isPending} onClick={() => save.mutate(f)}>
            Salvar
          </button>
        </div>
        <Disclaimer>Meça sempre no mesmo ponto, em jejum, sem apertar a fita. Só registre % de gordura de uma medição confiável — bioimpedância doméstica varia muito com hidratação.</Disclaimer>
      </Card>

      <Card title="Evolução" action={<select className="input" style={{ width: 'auto', minHeight: 34, padding: '4px 8px', fontSize: 14 }} value={metric} onChange={(e) => setMetric(e.target.value)} aria-label="Medida">{MEASURES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select>}>
        {data.length < 2 ? (
          <Empty>Registre pelo menos duas medições de {MEASURES.find((m) => m.key === metric)?.label.toLowerCase()}.</Empty>
        ) : (
          <>
            <div className="small" style={{ marginBottom: 8 }}>
              {n1(first)} → <b>{n1(last)}</b> {metric === 'body_fat' ? '%' : 'cm'} <span className="muted">({signed(last - first)})</span>
            </div>
            <div style={{ height: 180 }} role="img" aria-label={`Evolução de ${metric}`}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--grid)" />
                  <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={{ stroke: 'var(--axis)' }} tickLine={false} />
                  <YAxis domain={['dataMin - 1', 'dataMax + 1']} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={({ active, payload }) => (active && payload?.length ? <div className="chart-tip"><b>{dateLabel(payload[0].payload.date)}</b><div>{n1(payload[0].payload[metric])}</div></div> : null)} />
                  <Line dataKey={metric} stroke="var(--c-kcal)" strokeWidth={2} dot={{ r: 4, fill: 'var(--c-kcal)', stroke: 'var(--surface)', strokeWidth: 2 }} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </Card>

      <Card title="Histórico">
        {q.data.length === 0 ? (
          <Empty>Sem medições ainda.</Empty>
        ) : (
          <div className="list">
            {[...q.data].reverse().map((m: any) => (
              <div key={m.id} className="list-item" style={{ alignItems: 'flex-start' }}>
                <div className="grow">
                  <b className="small">{dateLabel(m.date, { year: true })}</b>
                  <div className="xs muted tabular">
                    {MEASURES.filter((x) => m[x.key] != null).map((x) => `${x.label} ${n1(m[x.key])}${x.key === 'body_fat' ? '%' : ''}`).join(' · ')}
                    {m.body_fat_method ? ` (${m.body_fat_method})` : ''}
                  </div>
                </div>
                <button className="icon-btn" style={{ border: 0, background: 'none' }} onClick={() => confirm('Remover esta medição?') && del.mutate(m.id)} aria-label="Remover medição">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

const POSES = [
  { value: 'frontal', label: 'Frontal' },
  { value: 'lateral', label: 'Lateral' },
  { value: 'posterior', label: 'Posterior' },
] as const;

function Photos({ today }: { today: string }) {
  const q = useApi<any[]>('/api/photos');
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [pose, setPose] = useState<string>('frontal');
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [a, setA] = useState<string>('');
  const [b, setB] = useState<string>('');
  const [cmpPose, setCmpPose] = useState<string>('frontal');
  const del = useAction((id: number) => api.del(`/api/photos/${id}`), { success: 'Foto excluída' });
  const upload = useAction(async (file: File) => {
    const blob = await prepareImage(file, 1600, 0.88);
    const fd = new FormData();
    fd.append('date', date);
    fd.append('pose', pose);
    fd.append('file', blob, 'foto.jpg');
    return api.post('/api/photos', fd);
  }, { success: 'Foto salva (privada)' });

  const dates = useMemo(() => [...new Set((q.data ?? []).map((p) => p.date))].sort(), [q.data]);
  if (q.isLoading || !q.data) return <Loading />;
  const first = a || dates[0] || '';
  const last = b || dates.at(-1) || '';
  const find = (d: string) => q.data!.find((p) => p.date === d && p.pose === cmpPose);
  const pa = find(first);
  const pb = find(last);
  const byDate = dates.slice().reverse();

  return (
    <>
      <Card title="Nova foto">
        <Segmented value={pose} onChange={setPose} options={POSES as any} />
        <div className="row" style={{ marginTop: 10 }}>
          <input className="input" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} style={{ maxWidth: 170 }} />
          <input
            ref={input}
            type="file"
            accept="image/*"
            capture="user"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setBusy(true);
              try {
                await upload.mutateAsync(file);
              } catch {
                /* toast já exibido */
              } finally {
                setBusy(false);
                e.target.value = '';
              }
            }}
          />
          <button className="btn primary grow" disabled={busy} onClick={() => input.current?.click()}>
            <Camera size={18} /> {busy ? 'Enviando…' : 'Tirar / escolher foto'}
          </button>
        </div>
        <Disclaimer>Fotos ficam no seu servidor, fora de pastas públicas, acessíveis só com login. A foto é reprocessada no aparelho, o que remove a localização (EXIF). Mesmo local, luz e horário facilitam a comparação.</Disclaimer>
      </Card>

      <Card title="Antes × agora">
        {dates.length < 2 ? (
          <Empty>Tire fotos em pelo menos duas datas para comparar.</Empty>
        ) : (
          <>
            <Segmented value={cmpPose} onChange={setCmpPose} options={POSES as any} />
            <div className="compare" style={{ marginTop: 10 }}>
              {[
                { d: first, set: setA, p: pa },
                { d: last, set: setB, p: pb },
              ].map((s, i) => (
                <div key={i} className="col" style={{ gap: 6 }}>
                  <select className="input" value={s.d} onChange={(e) => s.set(e.target.value)} aria-label={i ? 'Data depois' : 'Data antes'}>
                    {dates.map((d) => (
                      <option key={d} value={d}>{dateLabel(d, { year: true })}</option>
                    ))}
                  </select>
                  {s.p ? <img src={`/api/photos/${s.p.id}/file`} alt={`${cmpPose} em ${s.d}`} loading="lazy" /> : <div className="empty" style={{ aspectRatio: '3/4', background: 'var(--surface-2)', borderRadius: 10 }}>Sem foto {cmpPose}</div>}
                  <div className="xs sec tabular center">
                    {s.p?.weight_kg ? `${n1(s.p.weight_kg)} kg` : 'peso –'}
                    {s.p?.measurement?.waist ? ` · cintura ${n1(s.p.measurement.waist)} cm` : ''}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      {byDate.map((d) => (
        <Card key={d} title={dateLabel(d, { weekday: true, year: true })}>
          <div className="photo-grid">
            {q.data!.filter((p) => p.date === d).map((p) => (
              <div key={p.id} style={{ position: 'relative' }}>
                <img src={`/api/photos/${p.id}/file`} alt={`${p.pose} em ${d}`} loading="lazy" />
                <div className="row between xs" style={{ marginTop: 4 }}>
                  <span className="sec" style={{ textTransform: 'capitalize' }}>{p.pose}</span>
                  <button className="btn sm ghost" style={{ minHeight: 28, padding: '0 6px' }} onClick={() => confirm('Excluir esta foto?') && del.mutate(p.id)} aria-label="Excluir foto">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}
      {dates.length === 0 && (
        <p className="xs muted center" style={{ marginTop: 12 }}>
          Nenhuma foto ainda. A IA não é usada para estimar gordura a partir das fotos.
        </p>
      )}
    </>
  );
}
