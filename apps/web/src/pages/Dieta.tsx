import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Copy, GlassWater, Plus, Search, Star, Trash2, Watch } from 'lucide-react';
import { MEALS, addDays, scaleFood } from '@app/core';
import { api } from '../lib/api';
import { useAction, useApi } from '../lib/hooks';
import { CONFIDENCE_LABEL, dateLabel, n0, n1 } from '../lib/format';
import { Card, Disclaimer, Empty, Field, Loading, NumInput, Progress, Segmented, Sheet, useToast } from '../components/ui';
import { TopBar } from '../components/TopBar';
import { MealPhotoButton, defaultMeal } from '../components/MealPhoto';
import { balanceRange } from './Dashboard';

export function Dieta() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'diario';
  const status = useApi<any>('/api/auth/status');
  const dash = useApi<any>('/api/dashboard');
  const [date, setDate] = useState<string | null>(null);
  const today = dash.data?.date;
  const d = date ?? today;

  return (
    <>
      <TopBar eyebrow="Dieta" title={tab === 'diario' ? 'Alimentação' : tab === 'energia' ? 'Gasto energético' : 'Lista de compras'} />
      <Segmented value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} options={[{ value: 'diario', label: 'Diário' }, { value: 'energia', label: 'Gasto' }, { value: 'compras', label: 'Compras' }]} />
      {d && (
        <div className="row between" style={{ margin: '12px 0' }}>
          <button className="icon-btn" onClick={() => setDate(addDays(d, -1))} aria-label="Dia anterior">
            <ChevronLeft size={18} />
          </button>
          <b className="small" style={{ textTransform: 'capitalize' }}>{d === today ? 'Hoje' : dateLabel(d, { weekday: true })}</b>
          <button className="icon-btn" onClick={() => setDate(addDays(d, 1))} disabled={d >= today} aria-label="Próximo dia">
            <ChevronRight size={18} />
          </button>
        </div>
      )}
      {!d ? <Loading /> : tab === 'diario' ? <Diary date={d} aiEnabled={!!status.data?.aiEnabled} /> : tab === 'energia' ? <Energy date={d} /> : <Shopping />}
    </>
  );
}

function Diary({ date, aiEnabled }: { date: string; aiEnabled: boolean }) {
  const q = useApi<any>(`/api/nutrition/day?date=${date}`);
  const [add, setAdd] = useState<string | null>(null);
  const [edit, setEdit] = useState<any>(null);
  const [fav, setFav] = useState<string | null>(null);
  const water = useAction((ml: number) => api.post('/api/water', { date, ml }));
  const copy = useAction((meal: string) => api.post('/api/nutrition/copy-meal', { from_date: addDays(date, -1), from_meal: meal, to_date: date }), { success: 'Copiado de ontem' });
  if (q.isLoading || !q.data) return <Loading />;
  const n = q.data;
  const p = n.progress;
  const byMeal = MEALS.map((m) => ({ ...m, items: n.entries.filter((e: any) => e.meal === m.id) }));

  return (
    <>
      <Card>
        <div className="row between" style={{ alignItems: 'baseline' }}>
          <span className="xs muted" style={{ fontWeight: 650, letterSpacing: '0.06em' }}>CALORIAS DO DIA</span>
          <span className={`small ${p.calories.over ? '' : 'sec'}`} style={{ color: p.calories.over ? 'var(--bad)' : undefined, fontWeight: 600 }}>
            {p.calories.over ? `${n0(-p.calories.remaining)} kcal acima` : `${n0(p.calories.remaining)} kcal restantes`}
          </span>
        </div>
        <div className="tabular" style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em', margin: '4px 0 8px' }}>
          {n0(n.totals.calories)} <span className="muted" style={{ fontSize: 16, fontWeight: 500 }}>/ {n0(n.targets.calories)} kcal</span>
        </div>
        <div className={`bar ${p.calories.over ? 'over' : ''}`} style={{ height: 10 }}>
          <span style={{ width: `${Math.min(100, p.calories.pct)}%`, background: 'var(--c-kcal)' }} />
        </div>
        <div className="col" style={{ marginTop: 14, gap: 10 }}>
          <Progress label="Proteína" value={p.protein.consumed} max={p.protein.target} color="var(--c-protein)" hint={p.protein.remaining > 0 ? `faltam ${n0(p.protein.remaining)}` : 'ok'} />
          <Progress label="Carboidratos" value={p.carbs.consumed} max={p.carbs.target} color="var(--c-carbs)" />
          <Progress label="Gorduras" value={p.fat.consumed} max={p.fat.target} color="var(--c-fat)" />
        </div>
      </Card>

      <Card className="tight">
        <div className="row between">
          <span className="row small" style={{ fontWeight: 600 }}>
            <GlassWater size={18} color="var(--c-water)" /> Água <span className="muted tabular">{n0(n.water.consumed)} / {n0(n.water.target)} ml</span>
          </span>
          <div className="row">
            <button className="btn sm" onClick={() => water.mutate(-250)} disabled={n.water.consumed < 250} aria-label="Remover 250 ml">−</button>
            <button className="btn sm" onClick={() => water.mutate(250)}>+250</button>
            <button className="btn sm" onClick={() => water.mutate(500)}>+500</button>
          </div>
        </div>
      </Card>

      <div style={{ marginTop: 12 }}>
        <MealPhotoButton date={date} aiEnabled={aiEnabled} />
        <button className="btn block" style={{ marginTop: 8 }} onClick={() => setAdd(defaultMeal())}>
          <Plus size={18} /> Adicionar alimento
        </button>
      </div>

      {byMeal.map((m) => {
        const kcal = m.items.reduce((a: number, e: any) => a + e.calories, 0);
        const prot = m.items.reduce((a: number, e: any) => a + e.protein, 0);
        if (!m.items.length && (m.id === 'pre_treino' || m.id === 'livre' || m.id === 'ceia')) {
          return null;
        }
        return (
          <Card key={m.id} title={m.label} action={<span className="small muted tabular">{m.items.length ? `${n0(kcal)} kcal · ${n0(prot)} g P` : ''}</span>}>
            {m.items.length === 0 ? (
              <div className="row">
                <button className="btn sm ghost" onClick={() => setAdd(m.id)}>
                  <Plus size={14} /> Adicionar
                </button>
                <button className="btn sm ghost" onClick={() => copy.mutate(m.id)}>
                  <Copy size={14} /> Igual a ontem
                </button>
              </div>
            ) : (
              <>
                <div className="list">
                  {m.items.map((e: any) => (
                    <button key={e.id} className="list-item clickable" onClick={() => setEdit(e)} style={{ background: 'none', border: 0, borderTop: '1px solid var(--border)', textAlign: 'left', width: '100%', padding: '10px 0' }}>
                      <div className="grow">
                        <div style={{ fontWeight: 550 }}>
                          {e.name} {e.source === 'foto_ia' && <span className="chip" style={{ padding: '1px 6px', fontSize: 10 }}>IA · estimado</span>}
                        </div>
                        <div className="xs muted tabular">
                          {n0(e.quantity_g)} g · P {n1(e.protein)} · C {n1(e.carbs)} · G {n1(e.fat)}
                        </div>
                      </div>
                      <span className="tabular small" style={{ fontWeight: 600 }}>{n0(e.calories)}</span>
                    </button>
                  ))}
                </div>
                <div className="row" style={{ marginTop: 4 }}>
                  <button className="btn sm ghost" onClick={() => setAdd(m.id)}>
                    <Plus size={14} /> Adicionar
                  </button>
                  <button className="btn sm ghost" onClick={() => setFav(m.id)}>
                    <Star size={14} /> Favoritar
                  </button>
                </div>
              </>
            )}
          </Card>
        );
      })}

      <AddFoodSheet open={!!add} meal={add ?? 'almoco'} date={date} onClose={() => setAdd(null)} />
      <EditEntrySheet entry={edit} onClose={() => setEdit(null)} />
      <SaveFavoriteSheet meal={fav} date={date} onClose={() => setFav(null)} />
    </>
  );
}

function AddFoodSheet({ open, meal: initialMeal, date, onClose }: { open: boolean; meal: string; date: string; onClose: () => void }) {
  const [mode, setMode] = useState<'busca' | 'favoritas' | 'manual'>('busca');
  const [meal, setMeal] = useState(initialMeal);
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [picked, setPicked] = useState<any>(null);
  const [grams, setGrams] = useState<number | null>(null);
  const [manual, setManual] = useState<any>({ name: '', quantity_g: 100, calories: null, protein: null, carbs: null, fat: null, save_to_library: true });
  useEffect(() => setMeal(initialMeal), [initialMeal, open]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(term), 200);
    return () => clearTimeout(t);
  }, [term]);
  useEffect(() => {
    if (!open) {
      setPicked(null);
      setTerm('');
      setMode('busca');
    }
  }, [open]);
  const foods = useApi<any[]>(open && mode === 'busca' ? `/api/foods?q=${encodeURIComponent(debounced)}` : null);
  const favs = useApi<any[]>(open && mode === 'favoritas' ? '/api/favorite-meals' : null);
  const addLib = useAction((b: any) => api.post('/api/nutrition/entries', b), { success: 'Adicionado', onSuccess: () => setPicked(null) });
  const addManual = useAction((b: any) => api.post('/api/nutrition/entries', b), { success: 'Adicionado', onSuccess: onClose });
  const apply = useAction((id: number) => api.post(`/api/favorite-meals/${id}/apply`, { date, meal }), { success: 'Refeição adicionada', onSuccess: onClose });
  const toggleFav = useAction((f: any) => api.patch(`/api/foods/${f.id}`, { favorite: !f.favorite }));
  const delFav = useAction((id: number) => api.del(`/api/favorite-meals/${id}`));
  const preview = picked && grams ? scaleFood(picked, grams) : null;
  const manualOk = manual.name && manual.quantity_g > 0 && manual.calories != null && manual.protein != null && manual.carbs != null && manual.fat != null;

  return (
    <Sheet open={open} onClose={onClose} title="Adicionar alimento">
      <div className="col">
        <select className="input" value={meal} onChange={(e) => setMeal(e.target.value)} aria-label="Refeição">
          {MEALS.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
        <Segmented value={mode} onChange={setMode} options={[{ value: 'busca', label: 'Biblioteca' }, { value: 'favoritas', label: 'Favoritas' }, { value: 'manual', label: 'Manual' }]} />

        {mode === 'busca' && !picked && (
          <>
            <div className="row" style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: 12, color: 'var(--text-muted)' }} />
              <input className="input" style={{ paddingLeft: 36 }} placeholder="Buscar alimento" value={term} onChange={(e) => setTerm(e.target.value)} autoFocus />
            </div>
            <div className="list">
              {foods.data?.map((f) => (
                <div key={f.id} className="list-item">
                  <button className="grow" style={{ background: 'none', border: 0, textAlign: 'left', padding: 0, cursor: 'pointer' }} onClick={() => { setPicked(f); setGrams(f.default_grams); }}>
                    <div style={{ fontWeight: 550 }}>{f.name}</div>
                    <div className="xs muted tabular">
                      {n0(f.kcal_100)} kcal · P {n1(f.protein_100)} / 100 g{f.unit_label ? ` · ${f.unit_label}` : ''}
                    </div>
                  </button>
                  <button className="icon-btn" style={{ border: 0, background: 'none' }} onClick={() => toggleFav.mutate(f)} aria-label={f.favorite ? 'Remover dos favoritos' : 'Favoritar alimento'}>
                    <Star size={18} fill={f.favorite ? 'var(--warn)' : 'none'} color={f.favorite ? 'var(--warn)' : 'var(--text-muted)'} />
                  </button>
                </div>
              ))}
              {foods.data?.length === 0 && <Empty>Nada encontrado. Use “Manual” para cadastrar.</Empty>}
            </div>
          </>
        )}

        {mode === 'busca' && picked && (
          <>
            <div className="card tight" style={{ background: 'var(--surface-2)' }}>
              <b>{picked.name}</b>
              {picked.unit_label && <div className="xs muted">{picked.unit_label}</div>}
            </div>
            <Field label="Quantidade (g ou ml)">
              <NumInput value={grams} onChange={setGrams} autoFocus />
            </Field>
            <div className="row wrap">
              {[0.5, 1, 1.5, 2].map((k) => (
                <button key={k} className="btn sm" onClick={() => setGrams(Math.round(picked.default_grams * k))}>
                  {k}× porção ({Math.round(picked.default_grams * k)} g)
                </button>
              ))}
            </div>
            {preview && (
              <div className="small sec tabular">
                <b>{n0(preview.calories)} kcal</b> · P {n1(preview.protein)} g · C {n1(preview.carbs)} g · G {n1(preview.fat)} g
              </div>
            )}
            <div className="row">
              <button className="btn" onClick={() => setPicked(null)}>Voltar</button>
              <button className="btn primary grow" disabled={!grams || addLib.isPending} onClick={() => addLib.mutate({ date, meal, food_item_id: picked.id, quantity_g: grams })}>
                Adicionar
              </button>
            </div>
          </>
        )}

        {mode === 'favoritas' && (
          <div className="list">
            {favs.data?.length === 0 && <Empty>Nenhuma refeição favorita. Use “Favoritar” em uma refeição do diário.</Empty>}
            {favs.data?.map((f) => (
              <div key={f.id} className="list-item">
                <div className="grow">
                  <b>{f.name}</b>
                  <div className="xs muted tabular">
                    {f.items.length} itens · {n0(f.totals.calories)} kcal · {n0(f.totals.protein)} g P
                  </div>
                </div>
                <button className="btn sm primary" onClick={() => apply.mutate(f.id)}>Adicionar</button>
                <button className="icon-btn" onClick={() => confirm(`Excluir "${f.name}"?`) && delFav.mutate(f.id)} aria-label="Excluir favorita">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        {mode === 'manual' && (
          <>
            <Field label="Alimento">
              <input className="input" value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} placeholder="ex.: Marmita do restaurante" />
            </Field>
            <div className="grid2">
              <Field label="Quantidade (g)">
                <NumInput value={manual.quantity_g} onChange={(v) => setManual({ ...manual, quantity_g: v })} />
              </Field>
              <Field label="Calorias (kcal)">
                <NumInput value={manual.calories} onChange={(v) => setManual({ ...manual, calories: v })} />
              </Field>
            </div>
            <div className="grid3">
              <Field label="Proteína (g)">
                <NumInput value={manual.protein} onChange={(v) => setManual({ ...manual, protein: v })} />
              </Field>
              <Field label="Carbo (g)">
                <NumInput value={manual.carbs} onChange={(v) => setManual({ ...manual, carbs: v })} />
              </Field>
              <Field label="Gordura (g)">
                <NumInput value={manual.fat} onChange={(v) => setManual({ ...manual, fat: v })} />
              </Field>
            </div>
            <label className="row small">
              <input type="checkbox" checked={manual.save_to_library} onChange={(e) => setManual({ ...manual, save_to_library: e.target.checked })} /> Salvar na biblioteca
            </label>
            <button className="btn primary block" disabled={!manualOk || addManual.isPending} onClick={() => addManual.mutate({ date, meal, ...manual })}>
              Adicionar
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
}

function EditEntrySheet({ entry, onClose }: { entry: any; onClose: () => void }) {
  const [grams, setGrams] = useState<number | null>(null);
  const [meal, setMeal] = useState('');
  useEffect(() => {
    if (entry) {
      setGrams(entry.quantity_g);
      setMeal(entry.meal);
    }
  }, [entry]);
  const save = useAction((b: any) => api.patch(`/api/nutrition/entries/${entry.id}`, b), { success: 'Atualizado', onSuccess: onClose });
  const del = useAction(() => api.del(`/api/nutrition/entries/${entry.id}`), { success: 'Removido', onSuccess: onClose });
  return (
    <Sheet open={!!entry} onClose={onClose} title={entry?.name ?? ''}>
      {entry && (
        <div className="col">
          <Field label="Quantidade (g)">
            <NumInput value={grams} onChange={setGrams} />
          </Field>
          <Field label="Refeição">
            <select className="input" value={meal} onChange={(e) => setMeal(e.target.value)}>
              {MEALS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </Field>
          <p className="xs muted" style={{ margin: 0 }}>Os macros são reescalonados proporcionalmente à nova quantidade.</p>
          <div className="row">
            <button className="btn danger" onClick={() => del.mutate(undefined)}>
              <Trash2 size={16} /> Excluir
            </button>
            <button className="btn primary grow" disabled={!grams || save.isPending} onClick={() => save.mutate({ quantity_g: grams, meal })}>
              Salvar
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function SaveFavoriteSheet({ meal, date, onClose }: { meal: string | null; date: string; onClose: () => void }) {
  const [name, setName] = useState('');
  useEffect(() => setName(meal ? `Meu ${MEALS.find((m) => m.id === meal)?.label.toLowerCase()} padrão` : ''), [meal]);
  const save = useAction(() => api.post('/api/favorite-meals', { name, date, meal }), { success: 'Refeição favorita salva', onSuccess: onClose });
  return (
    <Sheet open={!!meal} onClose={onClose} title="Salvar como favorita">
      <div className="col">
        <Field label="Nome">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <button className="btn primary block" disabled={!name.trim() || save.isPending} onClick={() => save.mutate(undefined)}>
          Salvar
        </button>
      </div>
    </Sheet>
  );
}

function Energy({ date }: { date: string }) {
  const q = useApi<any>(`/api/energy?date=${date}`);
  const [f, setF] = useState<any>({});
  useEffect(() => {
    const dv = q.data?.device;
    setF({ active_calories: dv?.active_calories ?? null, total_calories: dv?.total_calories ?? null, steps: dv?.steps ?? null, avg_hr: dv?.avg_hr ?? null, activity_minutes: dv?.activity_minutes ?? null, workout_calories: dv?.workout_calories ?? null });
  }, [q.data?.device, date]);
  const save = useAction((b: any) => api.post('/api/energy', { date, ...b }), { success: 'Dados do relógio salvos' });
  if (q.isLoading || !q.data) return <Loading />;
  const b = q.data.balance;
  const ad = q.data.adaptive;
  const int = (v: number | null) => (v == null ? null : Math.round(v));
  return (
    <>
      <Card title="Balanço do dia" action={<span className="chip">{CONFIDENCE_LABEL[b.confidence]}</span>}>
        <div className="grid3">
          <div>
            <div className="xs muted">Gasto estimado</div>
            <div className="tabular" style={{ fontWeight: 700, fontSize: 18 }}>~{n0(b.expenditure.value)}</div>
            <div className="xs muted tabular">{n0(b.expenditure.low)}–{n0(b.expenditure.high)}</div>
          </div>
          <div>
            <div className="xs muted">Consumo</div>
            <div className="tabular" style={{ fontWeight: 700, fontSize: 18 }}>{n0(b.intake)}</div>
            <div className="xs muted">registrado</div>
          </div>
          <div>
            <div className="xs muted">{b.insufficient ? 'Balanço' : b.label === 'deficit' ? 'Déficit estimado' : b.label === 'superavit' ? 'Superávit estimado' : 'Balanço'}</div>
            <div className="tabular" style={{ fontWeight: 700, fontSize: 15 }}>{b.insufficient ? 'aguardando registros' : balanceRange(b)}</div>
          </div>
        </div>
        {b.warnings.map((w: string) => (
          <p key={w} className="xs" style={{ margin: '8px 0 0', color: 'var(--warn-text)' }}>{w}</p>
        ))}
        <Disclaimer>
          {b.expenditure.method}. {b.expenditure.notes.join(' ')} Não some as calorias do relógio à meta (“queimei 800, posso comer 800”): use o gasto como um indicador entre outros.
        </Disclaimer>
      </Card>

      <Card title="Manutenção pelos seus dados">
        {ad ? (
          <>
            <div className="hero-num tabular">~{n0(ad.value)} <span className="muted" style={{ fontSize: 15 }}>kcal/dia</span></div>
            <div className="small sec tabular">Faixa: {n0(ad.low)}–{n0(ad.high)} · {CONFIDENCE_LABEL[ad.confidence]}</div>
            <Disclaimer>{ad.method}. {ad.notes.join(' ')}</Disclaimer>
          </>
        ) : (
          <p className="small sec" style={{ margin: 0 }}>
            Precisa de pelo menos 14 dias com alimentação registrada (≥ 75% dos dias) e 8 pesagens. É a estimativa mais confiável do sistema — mais do que fórmulas ou o relógio.
          </p>
        )}
      </Card>

      <Card title="Dados do Garmin" icon={<Watch size={18} />}>
        <div className="grid2">
          <Field label="Calorias ativas">
            <NumInput value={f.active_calories} onChange={(v) => setF({ ...f, active_calories: v })} />
          </Field>
          <Field label="Calorias totais">
            <NumInput value={f.total_calories} onChange={(v) => setF({ ...f, total_calories: v })} />
          </Field>
          <Field label="Passos">
            <NumInput value={f.steps} onChange={(v) => setF({ ...f, steps: v })} />
          </Field>
          <Field label="FC média">
            <NumInput value={f.avg_hr} onChange={(v) => setF({ ...f, avg_hr: v })} />
          </Field>
          <Field label="Min. de atividade">
            <NumInput value={f.activity_minutes} onChange={(v) => setF({ ...f, activity_minutes: v })} />
          </Field>
          <Field label="Calorias do treino">
            <NumInput value={f.workout_calories} onChange={(v) => setF({ ...f, workout_calories: v })} />
          </Field>
        </div>
        <button
          className="btn primary block"
          style={{ marginTop: 12 }}
          disabled={save.isPending}
          onClick={() => save.mutate({ ...f, steps: int(f.steps), avg_hr: int(f.avg_hr) })}
        >
          Salvar
        </button>
        <p className="xs muted" style={{ marginBottom: 0 }}>Entrada manual por enquanto. A integração automática depende de acesso aprovado às APIs (veja docs/INTEGRATIONS.md).</p>
      </Card>
    </>
  );
}

function Shopping() {
  const q = useApi<any>('/api/shopping-list?days=7');
  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('pp-shopping') ?? '{}');
    } catch {
      return {};
    }
  });
  const toggle = (k: string) => {
    const next = { ...checked, [k]: !checked[k] };
    setChecked(next);
    try {
      localStorage.setItem('pp-shopping', JSON.stringify(next));
    } catch {
      /* ok */
    }
  };
  const toast = useToast();
  const items = useMemo(() => q.data?.items ?? [], [q.data]);
  if (q.isLoading || !q.data) return <Loading />;
  return (
    <Card title="Para a próxima semana" action={<button className="btn sm ghost" onClick={() => { setChecked({}); try { localStorage.removeItem('pp-shopping'); } catch { /* ok */ } toast('Lista reiniciada'); }}>Limpar</button>}>
      {items.length === 0 ? (
        <Empty>Registre sua alimentação por alguns dias: a lista é gerada a partir do que você realmente come.</Empty>
      ) : (
        <div className="list">
          {items.map((i: any) => (
            <label key={i.name} className="list-item clickable" style={{ opacity: checked[i.name] ? 0.45 : 1 }}>
              <input type="checkbox" checked={!!checked[i.name]} onChange={() => toggle(i.name)} style={{ width: 20, height: 20 }} />
              <span className="grow" style={{ textDecoration: checked[i.name] ? 'line-through' : undefined }}>{i.name}</span>
              <span className="small muted tabular">~{i.weekly_grams >= 1000 ? `${n1(i.weekly_grams / 1000)} kg` : `${i.weekly_grams} g`}</span>
            </label>
          ))}
        </div>
      )}
      <Disclaimer>Base: {q.data.basedOnDays} dias registrados, projetado para 7 dias. {q.data.note}</Disclaimer>
    </Card>
  );
}
