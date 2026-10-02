import { useRef, useState } from 'react';
import { Camera, Droplet, Plus, Trash2 } from 'lucide-react';
import { MEALS, rescale, sumMacros } from '@app/core';
import { api } from '../lib/api';
import { prepareImage } from '../lib/image';
import { useAction } from '../lib/hooks';
import { n0, n1 } from '../lib/format';
import { Disclaimer, Field, NumInput, Sheet, useToast } from './ui';

interface Item {
  key: number;
  name: string;
  grams: number;
  baseGrams: number;
  base: { calories: number; protein: number; carbs: number; fat: number };
  preparation: string;
  confidence: number | null;
}

let keySeq = 1;

export function defaultMeal(): string {
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  if (h < 10) return 'cafe_da_manha';
  if (h < 11.5) return 'lanche_manha';
  if (h < 15) return 'almoco';
  if (h < 17.5) return 'lanche_tarde';
  if (h < 21) return 'jantar';
  return 'ceia';
}

/** Botão "Fotografar refeição" + revisão obrigatória da estimativa antes de gravar. */
export function MealPhotoButton({ date, aiEnabled }: { date: string; aiEnabled: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [meal, setMeal] = useState(defaultMeal());
  const [hint, setHint] = useState('');

  const confirm = useAction(
    () =>
      api.post('/api/meals/confirm', {
        date,
        meal,
        photo_id: result.photo_id,
        confidence: result.analysis.confidence,
        items: items.map((i) => ({ name: i.preparation ? `${i.name} (${i.preparation})` : i.name, quantity_g: i.grams, ...rescale(i.base, i.baseGrams, i.grams) })),
      }),
    { success: 'Refeição adicionada ao diário', onSuccess: () => close() },
  );

  const close = () => {
    setResult(null);
    setItems([]);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setHint('');
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const blob = await prepareImage(file, 1568);
      setPreview(URL.createObjectURL(blob));
      const fd = new FormData();
      if (hint) fd.append('hint', hint);
      fd.append('file', blob, 'refeicao.jpg');
      const r = await api.post<any>('/api/meals/analyze', fd);
      setResult(r);
      setMeal(defaultMeal());
      setItems(
        r.analysis.foods.map((f: any) => ({
          key: keySeq++,
          name: f.name,
          grams: f.estimated_grams,
          baseGrams: f.estimated_grams,
          base: { calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat },
          preparation: f.preparation ?? '',
          confidence: f.confidence,
        })),
      );
    } catch (e: any) {
      toast(e.message, true);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const totals = sumMacros(items.map((i) => rescale(i.base, i.baseGrams, i.grams)));
  const upd = (k: number, patch: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === k ? { ...x, ...patch } : x)));
  const addFat = (name: string, grams: number) =>
    setItems((xs) => [...xs, { key: keySeq++, name, grams, baseGrams: grams, base: { calories: grams * 9, protein: 0, carbs: 0, fat: grams }, preparation: '', confidence: null }]);

  return (
    <>
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      <button
        className="btn primary lg block"
        disabled={busy}
        onClick={() => (aiEnabled ? input.current?.click() : toast('Análise por foto não configurada no servidor (ANTHROPIC_API_KEY). Use o registro manual.', true))}
      >
        {busy ? (
          <>
            <span className="spinner" style={{ width: 18, height: 18, borderTopColor: '#fff' }} /> Analisando a foto…
          </>
        ) : (
          <>
            <Camera size={20} /> Fotografar refeição
          </>
        )}
      </button>

      <Sheet open={!!result} onClose={close} title="Análise da refeição">
        {result && (
          <div className="col">
            {preview && <img src={preview} alt="Foto da refeição" style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 12 }} />}
            <div className="row between">
              <span className={`chip ${result.analysis.confidence >= 0.75 ? 'good' : result.analysis.confidence >= 0.5 ? 'warn' : 'bad'}`}>
                Confiança {Math.round(result.analysis.confidence * 100)}%
              </span>
              <span className="xs muted">Estimativa — revise antes de salvar</span>
            </div>

            {items.map((i) => {
              const m = rescale(i.base, i.baseGrams, i.grams);
              return (
                <div key={i.key} className="card tight" style={{ background: 'var(--surface-2)' }}>
                  <div className="row">
                    <input className="input grow" value={i.name} onChange={(e) => upd(i.key, { name: e.target.value })} aria-label="Alimento" />
                    <button className="icon-btn" onClick={() => setItems((xs) => xs.filter((x) => x.key !== i.key))} aria-label="Remover item">
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="grid2" style={{ marginTop: 8 }}>
                    <Field label="Quantidade (g)">
                      <NumInput value={i.grams} onChange={(v) => v != null && v > 0 && upd(i.key, { grams: v })} />
                    </Field>
                    <Field label="Preparo">
                      <input className="input" value={i.preparation} onChange={(e) => upd(i.key, { preparation: e.target.value })} placeholder="grelhado, frito…" />
                    </Field>
                  </div>
                  <div className="xs sec tabular" style={{ marginTop: 6 }}>
                    {n0(m.calories)} kcal · P {n1(m.protein)} · C {n1(m.carbs)} · G {n1(m.fat)}
                    {i.confidence != null && <span className="muted"> · confiança {Math.round(i.confidence * 100)}%</span>}
                  </div>
                </div>
              );
            })}

            <div className="row wrap">
              <button className="btn sm" onClick={() => addFat('Azeite/óleo (1 colher)', 8)}>
                <Droplet size={14} /> + óleo/azeite
              </button>
              <button className="btn sm" onClick={() => addFat('Manteiga (1 colher de chá)', 5)}>
                <Plus size={14} /> + manteiga
              </button>
              <button className="btn sm" onClick={() => setItems((xs) => [...xs, { key: keySeq++, name: 'Molho', grams: 30, baseGrams: 30, base: { calories: 45, protein: 0.5, carbs: 3, fat: 3.5 }, preparation: '', confidence: null }])}>
                <Plus size={14} /> + molho
              </button>
            </div>

            <div className="card tight">
              <div className="xs muted">Estimativa total</div>
              <div className="tabular" style={{ fontSize: 22, fontWeight: 700 }}>{n0(totals.calories)} kcal</div>
              <div className="small sec tabular">
                {n0(totals.protein)} g proteína · {n0(totals.carbs)} g carboidratos · {n0(totals.fat)} g gordura
              </div>
            </div>

            {result.analysis.warnings.map((w: string) => (
              <p key={w} className="xs" style={{ margin: 0, color: 'var(--warn-text)' }}>⚠️ {w}</p>
            ))}
            {result.analysis.assumptions.length > 0 && (
              <div className="xs sec">
                <b>Premissas da IA:</b>
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {result.analysis.assumptions.map((a: string) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.analysis.questions.length > 0 && (
              <div className="xs sec">
                <b>Para melhorar a estimativa:</b> {result.analysis.questions.join(' ')}
              </div>
            )}

            <Field label="Refeição">
              <select className="input" value={meal} onChange={(e) => setMeal(e.target.value)}>
                {MEALS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </Field>
            <Disclaimer>
              Fotos não mostram óleo, açúcar, recheios nem o peso real. Erros de 20–40% são comuns. Corrija as quantidades se souber — uma balança de cozinha vale mais que qualquer IA.
            </Disclaimer>
            <button className="btn primary lg block" disabled={!items.length || confirm.isPending} onClick={() => confirm.mutate(undefined)}>
              Adicionar ao diário
            </button>
          </div>
        )}
      </Sheet>
      {!result && aiEnabled && (
        <input className="input" style={{ marginTop: 8 }} placeholder="Dica opcional para a IA (ex.: frango frito, 2 colheres de arroz)" value={hint} onChange={(e) => setHint(e.target.value)} />
      )}
    </>
  );
}
