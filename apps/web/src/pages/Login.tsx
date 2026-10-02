import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { Field, NumInput, Segmented, useToast } from '../components/ui';

export function Login() {
  const qc = useQueryClient();
  const toast = useToast();
  const status = useApi<{ registrationOpen: boolean }>('/api/auth/status');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ email: '', password: '', name: '', age: 19 as number | null, height_cm: 175 as number | null, initial_weight_kg: 75 as number | null, sex: 'masculino' });
  const reg = status.data?.registrationOpen;
  const m = reg ? mode : 'login';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (m === 'login') await api.post('/api/auth/login', { email: f.email, password: f.password });
      else
        await api.post('/api/auth/register', {
          ...f,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
        });
      await qc.invalidateQueries();
    } catch (err: any) {
      toast(err.message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="main" style={{ maxWidth: 440, paddingTop: 'calc(env(safe-area-inset-top) + 48px)' }}>
      <div className="col" style={{ gap: 6, marginBottom: 24 }}>
        <div className="eyebrow muted xs" style={{ letterSpacing: '0.1em', fontWeight: 700 }}>
          PAINEL PESSOAL
        </div>
        <h1 style={{ fontSize: 32 }}>Performance</h1>
        <p className="sec" style={{ margin: 0 }}>
          Treino, nutrição, recuperação e evolução em um só lugar.
        </p>
      </div>
      {reg && (
        <div style={{ marginBottom: 16 }}>
          <Segmented value={mode} onChange={setMode} options={[{ value: 'login', label: 'Entrar' }, { value: 'register', label: 'Criar conta' }]} />
        </div>
      )}
      <form className="card col" onSubmit={submit}>
        {m === 'register' && (
          <Field label="Nome">
            <input className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" />
          </Field>
        )}
        <Field label="E-mail">
          <input className="input" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" />
        </Field>
        <Field label="Senha">
          <input className="input" type="password" required minLength={m === 'register' ? 8 : 1} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete={m === 'login' ? 'current-password' : 'new-password'} />
        </Field>
        {m === 'register' && (
          <>
            <div className="grid3">
              <Field label="Idade">
                <NumInput value={f.age} onChange={(v) => setF({ ...f, age: v })} />
              </Field>
              <Field label="Altura (cm)">
                <NumInput value={f.height_cm} onChange={(v) => setF({ ...f, height_cm: v })} />
              </Field>
              <Field label="Peso (kg)">
                <NumInput value={f.initial_weight_kg} onChange={(v) => setF({ ...f, initial_weight_kg: v })} />
              </Field>
            </div>
            <Field group label="Sexo">
              <Segmented value={f.sex} onChange={(v) => setF({ ...f, sex: v })} options={[{ value: 'masculino', label: 'Masculino' }, { value: 'feminino', label: 'Feminino' }]} />
            </Field>
            <p className="xs muted" style={{ margin: 0 }}>
              A conta já nasce com sua rotina (futvôlei seg/qua, tênis ter/qui), o programa A/B/C e metas iniciais. Tudo editável em Perfil.
            </p>
          </>
        )}
        <button className="btn primary lg block" disabled={busy}>
          {busy ? 'Aguarde…' : m === 'login' ? 'Entrar' : 'Criar conta'}
        </button>
      </form>
    </div>
  );
}
