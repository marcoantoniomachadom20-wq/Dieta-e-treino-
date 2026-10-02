import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Download, LogOut, Moon, Plus, Sun, Trash2 } from 'lucide-react';
import { WEEKDAY_NAMES } from '@app/core';
import { api } from '../lib/api';
import { useAction, useApi } from '../lib/hooks';
import { n0 } from '../lib/format';
import { Card, Disclaimer, Field, Loading, NumInput, Segmented, Sheet, useToast } from '../components/ui';
import { TopBar } from '../components/TopBar';

const SLOTS = [
  { v: 'manha', l: 'Manhã' },
  { v: 'almoco', l: 'Almoço' },
  { v: 'tarde', l: 'Tarde' },
  { v: 'pos_esporte', l: 'Pós-esporte' },
];

export function Perfil() {
  const q = useApi<any>('/api/profile');
  const qc = useQueryClient();
  const [theme, setTheme] = useState<string>(() => document.documentElement.dataset.theme ?? 'auto');
  const logout = async () => {
    await api.post('/api/auth/logout');
    qc.clear();
    qc.setQueryData(['/api/auth/me'], null);
    window.location.href = '/';
  };
  const applyTheme = (t: string) => {
    setTheme(t);
    try {
      if (t === 'auto') {
        delete document.documentElement.dataset.theme;
        localStorage.removeItem('pp-theme');
      } else {
        document.documentElement.dataset.theme = t;
        localStorage.setItem('pp-theme', t);
      }
    } catch {
      /* ok */
    }
  };
  if (!q.data) return <Loading />;
  return (
    <>
      <TopBar eyebrow="Perfil" title="Configurações" />
      <ProfileForm data={q.data} />
      <TargetsForm data={q.data} />
      <ScheduleForm data={q.data} />
      <TemplatesCard data={q.data} />
      <Card title="Aparência">
        <Segmented value={theme} onChange={applyTheme} options={[{ value: 'auto', label: 'Automático' }, { value: 'dark', label: <span className="row" style={{ gap: 4 }}><Moon size={14} /> Escuro</span> }, { value: 'light', label: <span className="row" style={{ gap: 4 }}><Sun size={14} /> Claro</span> }]} />
      </Card>
      <PasswordCard />
      <Card title="Seus dados">
        <div className="col">
          <a className="btn block" href="/api/export" download>
            <Download size={16} /> Exportar tudo (JSON)
          </a>
          <button className="btn block danger" onClick={logout}>
            <LogOut size={16} /> Sair
          </button>
        </div>
        <Disclaimer>Backup completo (banco + fotos) é feito no servidor com <code>npm run backup</code>. Veja o README.</Disclaimer>
      </Card>
      <p className="xs muted center" style={{ marginTop: 16 }}>
        Este app organiza, estima e sugere. Não é médico nem nutricionista.
      </p>
    </>
  );
}

function ProfileForm({ data }: { data: any }) {
  const [f, setF] = useState<any>(data.user);
  useEffect(() => setF(data.user), [data.user]);
  const save = useAction((b: any) => api.put('/api/profile', b), { success: 'Perfil salvo' });
  const toggleSlot = (wd: number, slot: string) => {
    const cur: string[] = f.lift_availability[wd] ?? [];
    setF({ ...f, lift_availability: { ...f.lift_availability, [wd]: cur.includes(slot) ? cur.filter((s) => s !== slot) : [...cur, slot] } });
  };
  return (
    <Card title="Perfil">
      <div className="col">
        <Field label="Nome">
          <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <div className="grid3">
          <Field label="Idade">
            <NumInput value={f.age} onChange={(v) => setF({ ...f, age: v })} />
          </Field>
          <Field label="Altura (cm)">
            <NumInput value={f.height_cm} onChange={(v) => setF({ ...f, height_cm: v })} />
          </Field>
          <Field label="Peso inicial">
            <NumInput value={f.initial_weight_kg} onChange={(v) => setF({ ...f, initial_weight_kg: v })} />
          </Field>
        </div>
        <Field label="Objetivo principal">
          <select className="input" value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value })}>
            <option value="perda_gordura">Reduzir gordura mantendo/ganhando músculo</option>
            <option value="recomposicao">Recomposição corporal</option>
            <option value="ganho_massa">Ganho de massa</option>
            <option value="manutencao">Manutenção / performance</option>
          </select>
        </Field>
        <Field group label="Musculação por semana">
          <Segmented value={String(f.lift_target_per_week)} onChange={(v) => setF({ ...f, lift_target_per_week: Number(v) })} options={['1', '2', '3', '4'].map((v) => ({ value: v, label: v }))} />
        </Field>
        <div className="field">
          <span>Quando posso treinar musculação</span>
          {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
            <div key={wd} className="row" style={{ gap: 4 }}>
              <span className="small" style={{ width: 64, textTransform: 'capitalize' }}>{WEEKDAY_NAMES[wd].slice(0, 3)}</span>
              <div className="row wrap grow" style={{ gap: 4 }}>
                {SLOTS.map((s) => {
                  const on = (f.lift_availability[wd] ?? []).includes(s.v);
                  return (
                    <button key={s.v} className={`btn sm ${on ? 'primary' : ''}`} style={{ minHeight: 30, padding: '0 8px', fontSize: 12 }} onClick={() => toggleSlot(wd, s.v)} aria-pressed={on}>
                      {s.l}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <button className="btn primary block" disabled={save.isPending} onClick={() => save.mutate({ ...f, goal_notes: f.goal_notes ?? null })}>
          Salvar perfil
        </button>
        <p className="xs muted" style={{ margin: 0 }}>Mudanças de disponibilidade valem no próximo replanejamento (Treinos → Semana).</p>
      </div>
    </Card>
  );
}

function TargetsForm({ data }: { data: any }) {
  const [t, setT] = useState<any>(data.targets);
  const toast = useToast();
  useEffect(() => setT(data.targets), [data.targets]);
  const save = useAction((b: any) => api.put('/api/profile/targets', b), { onSuccess: (r) => toast(r.warning ?? 'Metas atualizadas a partir de hoje', !!r.warning) });
  const s = data.suggestion;
  const kcalMacros = (t.protein ?? 0) * 4 + (t.carbs ?? 0) * 4 + (t.fat ?? 0) * 9;
  return (
    <Card title="Metas nutricionais">
      <div className="grid2">
        <Field label="Calorias (kcal)">
          <NumInput value={t.calories} onChange={(v) => setT({ ...t, calories: v })} />
        </Field>
        <Field label="Proteína (g)">
          <NumInput value={t.protein} onChange={(v) => setT({ ...t, protein: v })} />
        </Field>
        <Field label="Carboidratos (g)">
          <NumInput value={t.carbs} onChange={(v) => setT({ ...t, carbs: v })} />
        </Field>
        <Field label="Gorduras (g)">
          <NumInput value={t.fat} onChange={(v) => setT({ ...t, fat: v })} />
        </Field>
        <Field label="Água (ml)">
          <NumInput value={t.water_ml} onChange={(v) => setT({ ...t, water_ml: v })} />
        </Field>
      </div>
      <p className="xs muted">Macros somam ~{n0(kcalMacros)} kcal.</p>
      <div className="insight small">
        <div>
          <b>Referência por fórmula</b> (peso atual): manutenção ~{n0(s.maintenance.value)} kcal (faixa {n0(s.maintenance.low)}–{n0(s.maintenance.high)}); proteína {s.protein.low}–{s.protein.high} g; gordura {s.fat.low}–{s.fat.high} g.
          <div className="xs muted" style={{ marginTop: 4 }}>{s.notes.join(' ')}</div>
        </div>
      </div>
      <button className="btn primary block" style={{ marginTop: 12 }} disabled={save.isPending} onClick={() => save.mutate(t)}>
        Salvar metas
      </button>
      <Disclaimer>Metas não são verdade médica. Ajuste com base na tendência do peso médio, fome, recuperação e performance — idealmente com um nutricionista. A mudança vale a partir de hoje; o histórico mantém as metas da época.</Disclaimer>
    </Card>
  );
}

function ScheduleForm({ data }: { data: any }) {
  const [items, setItems] = useState<any[]>(data.schedule);
  useEffect(() => setItems(data.schedule), [data.schedule]);
  const save = useAction((b: any) => api.put('/api/profile/schedule', b), { success: 'Rotina salva e semana atualizada' });
  const upd = (i: number, p: any) => setItems(items.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return (
    <Card title="Rotina esportiva">
      <div className="col" style={{ gap: 8 }}>
        {items.map((s, i) => (
          <div key={i} className="row wrap" style={{ gap: 6 }}>
            <select className="input" style={{ width: 92 }} value={s.weekday} onChange={(e) => upd(i, { weekday: Number(e.target.value) })} aria-label="Dia">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => <option key={d} value={d}>{WEEKDAY_NAMES[d].slice(0, 3)}</option>)}
            </select>
            <select className="input" style={{ width: 118 }} value={s.type} onChange={(e) => upd(i, { type: e.target.value })} aria-label="Modalidade">
              <option value="futevolei">Futvôlei</option>
              <option value="tenis">Tênis</option>
              <option value="recuperacao">Recuperação</option>
              <option value="outro">Outro</option>
            </select>
            <input className="input" type="time" style={{ width: 104 }} value={s.time ?? ''} onChange={(e) => upd(i, { time: e.target.value || null })} aria-label="Horário" />
            <label className="row xs" style={{ gap: 4 }}>
              <input type="checkbox" checked={!!s.optional} onChange={(e) => upd(i, { optional: e.target.checked })} /> possível
            </label>
            <button className="icon-btn" style={{ border: 0, background: 'none' }} onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="Remover">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <button className="btn sm ghost" onClick={() => setItems([...items, { weekday: 6, type: 'futevolei', time: '09:00', duration_min: 90, optional: true }])}>
          <Plus size={14} /> Adicionar esporte
        </button>
        <button className="btn primary block" disabled={save.isPending} onClick={() => save.mutate(items.map((s) => ({ weekday: s.weekday, type: s.type, time: s.time || null, duration_min: s.duration_min ?? 90, optional: !!s.optional })))}>
          Salvar rotina
        </button>
      </div>
    </Card>
  );
}

function TemplatesCard({ data }: { data: any }) {
  const [edit, setEdit] = useState<any>(null);
  const save = useAction((t: any) => api.put(`/api/profile/templates/${t.code}`, { name: t.name, focus: t.focus, exercises: t.exercises.map((e: any) => ({ name: e.name, sets: e.sets, rep_min: e.rep_min, rep_max: e.rep_max, rest_s: e.rest_s ?? 90, lower: !!e.lower, notes: e.notes ?? null })) }), {
    success: 'Treino salvo',
    onSuccess: () => setEdit(null),
  });
  const upd = (i: number, p: any) => setEdit({ ...edit, exercises: edit.exercises.map((e: any, j: number) => (j === i ? { ...e, ...p } : e)) });
  return (
    <Card title="Programa de musculação">
      <div className="list">
        {data.templates.map((t: any) => (
          <button key={t.id} className="list-item clickable" style={{ background: 'none', border: 0, borderTop: '1px solid var(--border)', width: '100%', textAlign: 'left' }} onClick={() => setEdit(JSON.parse(JSON.stringify(t)))}>
            <div className="grow">
              <b>{t.name}</b>
              <div className="xs muted">{t.focus} · {t.exercises.length} exercícios · carga de pernas {Math.round(t.lower_load * 100)}%</div>
            </div>
            <span className="small" style={{ color: 'var(--accent)' }}>Editar</span>
          </button>
        ))}
      </div>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.name ?? ''}>
        {edit && (
          <div className="col">
            <div className="grid2">
              <Field label="Nome"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
              <Field label="Foco"><input className="input" value={edit.focus} onChange={(e) => setEdit({ ...edit, focus: e.target.value })} /></Field>
            </div>
            {edit.exercises.map((e: any, i: number) => (
              <div key={i} className="card tight" style={{ background: 'var(--surface-2)' }}>
                <div className="row">
                  <input className="input grow" value={e.name} onChange={(ev) => upd(i, { name: ev.target.value })} aria-label="Exercício" />
                  <button className="icon-btn" onClick={() => setEdit({ ...edit, exercises: edit.exercises.filter((_: any, j: number) => j !== i) })} aria-label="Remover exercício"><Trash2 size={16} /></button>
                </div>
                <div className="grid3" style={{ marginTop: 6 }}>
                  <Field label="Séries"><NumInput value={e.sets} onChange={(v) => upd(i, { sets: v })} /></Field>
                  <Field label="Reps mín"><NumInput value={e.rep_min} onChange={(v) => upd(i, { rep_min: v })} /></Field>
                  <Field label="Reps máx"><NumInput value={e.rep_max} onChange={(v) => upd(i, { rep_max: v })} /></Field>
                </div>
                <label className="row xs" style={{ marginTop: 6 }}>
                  <input type="checkbox" checked={!!e.lower} onChange={(ev) => upd(i, { lower: ev.target.checked })} /> Exercício de pernas (conta para fadiga de membros inferiores)
                </label>
              </div>
            ))}
            <button className="btn sm ghost" onClick={() => setEdit({ ...edit, exercises: [...edit.exercises, { name: '', sets: 3, rep_min: 8, rep_max: 12, rest_s: 90, lower: false }] })}>
              <Plus size={14} /> Exercício
            </button>
            <button className="btn primary block" disabled={save.isPending || edit.exercises.some((e: any) => !e.name || !e.sets || !e.rep_min || !e.rep_max)} onClick={() => save.mutate(edit)}>
              Salvar treino
            </button>
          </div>
        )}
      </Sheet>
    </Card>
  );
}

function PasswordCard() {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const save = useAction(() => api.put('/api/auth/password', { current: cur, next }), { success: 'Senha alterada', onSuccess: () => { setCur(''); setNext(''); } });
  return (
    <Card title="Segurança">
      <div className="col">
        <input className="input" type="password" placeholder="Senha atual" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
        <input className="input" type="password" placeholder="Nova senha (mín. 8)" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        <button className="btn block" disabled={!cur || next.length < 8 || save.isPending} onClick={() => save.mutate(undefined)}>
          Alterar senha
        </button>
      </div>
    </Card>
  );
}
