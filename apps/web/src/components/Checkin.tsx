import { useState } from 'react';
import { api } from '../lib/api';
import { useAction } from '../lib/hooks';
import { Disclaimer, Field, NumInput, ScalePicker, Sheet, StatusChip } from './ui';

type Vals = { sleep_hours: number | null; sleep_quality: number | null; energy: number | null; soreness: number | null; stress: number | null; motivation: number | null };

/** Check-in matinal / de recuperação. Duas etapas: sono → corpo. Mostra a recomendação no fim. */
export function CheckinSheet({ open, onClose, date, initial }: { open: boolean; onClose: () => void; date: string; initial?: Partial<Vals> | null }) {
  const [step, setStep] = useState(0);
  const [v, setV] = useState<Vals>({ sleep_hours: null, sleep_quality: null, energy: null, soreness: null, stress: null, motivation: null, ...(initial ?? {}) });
  const [result, setResult] = useState<any>(null);
  const save = useAction((b: Vals) => api.post('/api/recovery', { date, ...b }), { onSuccess: (r) => setResult(r) });
  const close = () => {
    setStep(0);
    setResult(null);
    onClose();
  };
  const step1ok = v.sleep_quality && v.energy;
  const step2ok = v.soreness && v.stress && v.motivation;

  return (
    <Sheet open={open} onClose={close} title={result ? 'Seu dia' : step === 0 ? 'Bom dia. Como você dormiu?' : 'Como está seu corpo hoje?'}>
      {result ? (
        <div className="col">
          <div className="row between">
            <span className="sec">Status de recuperação</span>
            <StatusChip status={result.status} />
          </div>
          <div className="hero-num tabular">
            {result.score}
            <span className="muted" style={{ fontSize: 16 }}>
              /100
            </span>
          </div>
          {result.limiting?.length > 0 && <p className="small sec" style={{ margin: 0 }}>Pesando contra: {result.limiting.join(', ').toLowerCase()}.</p>}
          <div className="insight">
            <span>💡</span>
            <span>{result.recommendation}</span>
          </div>
          <Disclaimer>{result.disclaimer}</Disclaimer>
          <button className="btn primary block" onClick={close}>
            Entendi
          </button>
        </div>
      ) : step === 0 ? (
        <div className="col">
          <Field label="Horas de sono">
            <NumInput value={v.sleep_hours} onChange={(n) => setV({ ...v, sleep_hours: n })} placeholder="ex.: 7,5" />
          </Field>
          <Field group label="Qualidade do sono">
            <ScalePicker value={v.sleep_quality} onChange={(n) => setV({ ...v, sleep_quality: n })} labels={['péssima', 'excelente']} />
          </Field>
          <Field group label="Energia">
            <ScalePicker value={v.energy} onChange={(n) => setV({ ...v, energy: n })} labels={['esgotado', 'muita']} />
          </Field>
          <button className="btn primary block" disabled={!step1ok} onClick={() => setStep(1)}>
            Continuar
          </button>
        </div>
      ) : (
        <div className="col">
          <Field group label="Dor muscular">
            <ScalePicker value={v.soreness} onChange={(n) => setV({ ...v, soreness: n })} labels={['nenhuma', 'muita']} />
          </Field>
          <Field group label="Estresse">
            <ScalePicker value={v.stress} onChange={(n) => setV({ ...v, stress: n })} labels={['tranquilo', 'muito']} />
          </Field>
          <Field group label="Motivação">
            <ScalePicker value={v.motivation} onChange={(n) => setV({ ...v, motivation: n })} labels={['nenhuma', 'muita']} />
          </Field>
          <div className="row">
            <button className="btn" onClick={() => setStep(0)}>
              Voltar
            </button>
            <button className="btn primary grow" disabled={!step2ok || save.isPending} onClick={() => save.mutate(v)}>
              Ver recomendação
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
