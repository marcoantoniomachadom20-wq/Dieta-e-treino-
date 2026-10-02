import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarCheck, CheckCircle2, ChevronRight, Circle, Flame, HeartPulse, Scale, Sparkles, ThumbsUp, Zap } from 'lucide-react';
import { useApi } from '../lib/hooks';
import { ACTIVITY_COLOR, ACTIVITY_SHORT, CONFIDENCE_LABEL, dateLabel, greeting, n0, n1, signed } from '../lib/format';
import { Card, Disclaimer, Loading, Progress, Ring, Stat, StatusChip } from '../components/ui';
import { TopBar } from '../components/TopBar';
import { CheckinSheet } from '../components/Checkin';

/** Faixa do balanço em linguagem natural; quando cruza o zero, mostra com sinal. */
export function balanceRange(b: { balanceLow: number; balanceHigh: number }) {
  if (b.balanceHigh < 0) return `${n0(-b.balanceHigh)}–${n0(-b.balanceLow)} kcal`;
  if (b.balanceLow > 0) return `${n0(b.balanceLow)}–${n0(b.balanceHigh)} kcal`;
  return `${signed(b.balanceLow, 0)} a ${signed(b.balanceHigh, 0)} kcal`;
}

const dismissKey = (d: string) => `pp-checkin-dismissed-${d}`;

export function Dashboard() {
  const q = useApi<any>('/api/dashboard');
  const [checkin, setCheckin] = useState(false);
  const d = q.data;

  // Check-in matinal automático: primeira abertura do dia sem check-in.
  useEffect(() => {
    if (!d || d.recovery) return;
    try {
      if (!localStorage.getItem(dismissKey(d.date))) setCheckin(true);
    } catch {
      /* sem storage: não abre sozinho */
    }
  }, [d?.date, d?.recovery]);

  const closeCheckin = () => {
    setCheckin(false);
    try {
      if (d) localStorage.setItem(dismissKey(d.date), '1');
    } catch {
      /* ok */
    }
  };

  if (q.isLoading || !d) return <Loading />;
  const p = d.nutrition.progress;
  const kcalLeft = p.calories.remaining;
  const bal = d.energy.balance;

  return (
    <>
      <TopBar eyebrow={`Hoje — ${dateLabel(d.date, { weekday: true })}`} title={`${greeting()}, ${d.user.name.split(' ')[0]}.`} />

      <Card className="tight">
        <div className="row between" style={{ marginBottom: 8 }}>
          <span className="row small sec">
            <HeartPulse size={16} /> Recuperação
          </span>
          <div className="row">
            <StatusChip status={d.recovery?.status} />
            <button className="btn sm" onClick={() => setCheckin(true)}>
              {d.recovery ? 'Refazer' : 'Check-in'}
            </button>
          </div>
        </div>
        <p className="small" style={{ margin: 0 }}>
          {d.recommendation}
        </p>
      </Card>

      <Card>
        <div className="row" style={{ gap: 16, alignItems: 'center' }}>
          <Ring pct={p.calories.pct} color="var(--c-kcal)" size={124} stroke={11}>
            <div>
              <div className="tabular" style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>
                {n0(d.nutrition.totals.calories)}
              </div>
              <div className="xs muted tabular">/ {n0(d.nutrition.targets.calories)} kcal</div>
            </div>
          </Ring>
          <div className="grow col" style={{ gap: 10 }}>
            <div>
              <div className="xs muted">{kcalLeft >= 0 ? 'Restantes' : 'Acima da meta'}</div>
              <div className="tabular" style={{ fontSize: 22, fontWeight: 700, color: kcalLeft < 0 ? 'var(--bad)' : undefined }}>
                {n0(Math.abs(kcalLeft))} kcal
              </div>
            </div>
            <div>
              <div className="xs muted">Proteína faltando</div>
              <div className="tabular" style={{ fontSize: 18, fontWeight: 650 }}>
                {p.protein.remaining > 0 ? `${n0(p.protein.remaining)} g` : 'Meta batida ✓'}
              </div>
            </div>
          </div>
        </div>
        <div className="col" style={{ marginTop: 16, gap: 10 }}>
          <Progress label="Proteína" value={p.protein.consumed} max={p.protein.target} color="var(--c-protein)" />
          <Progress label="Carboidratos" value={p.carbs.consumed} max={p.carbs.target} color="var(--c-carbs)" />
          <Progress label="Gorduras" value={p.fat.consumed} max={p.fat.target} color="var(--c-fat)" />
          <Progress label="Água" value={d.nutrition.water.consumed} max={d.nutrition.water.target} color="var(--c-water)" unit="ml" />
        </div>
        <Link to="/dieta" className="btn block" style={{ marginTop: 14 }}>
          Registrar refeição <ChevronRight size={16} />
        </Link>
      </Card>

      <Card title="Agenda de hoje" icon={<CalendarCheck size={18} />} action={<Link to="/treinos" className="small">Treinos</Link>}>
        {d.sessions.length === 0 ? (
          <p className="small sec" style={{ margin: 0 }}>Nada planejado. Dia de descanso.</p>
        ) : (
          <div className="list">
            {d.sessions.map((s: any) => (
              <Link to={`/treinos/${s.id}`} key={s.id} className="list-item clickable" style={{ color: 'inherit' }}>
                <span className="bar-v" style={{ background: ACTIVITY_COLOR[s.type] }} />
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>
                    {ACTIVITY_SHORT[s.type]}
                    {s.template_code ? ` ${s.template_code}` : ''}
                    {s.optional ? <span className="muted small"> · possível</span> : null}
                  </div>
                  <div className="xs muted">
                    {s.planned_time ?? 'horário livre'}
                    {s.status === 'concluido' && s.duration_min ? ` · ${n0(s.duration_min)} min · RPE ${s.rpe}` : ''}
                  </div>
                </div>
                {s.status === 'concluido' ? (
                  <span className="chip good">
                    <CheckCircle2 size={14} /> Feito
                  </span>
                ) : s.status === 'pulado' ? (
                  <span className="chip">Pulado</span>
                ) : s.status === 'em_andamento' ? (
                  <span className="chip accent">Em andamento</span>
                ) : (
                  <Circle size={20} color="var(--text-muted)" />
                )}
              </Link>
            ))}
          </div>
        )}
      </Card>

      <div className="grid2" style={{ marginTop: 12 }}>
        <Stat label="Peso (média 7d)" value={n1(d.weight.avg7 ?? d.weight.current)} unit="kg" sub={d.weight.currentDate ? `último: ${n1(d.weight.current)} kg · ${dateLabel(d.weight.currentDate)}` : 'registre em Evolução'} />
        <Stat label="Sequência" value={d.streak.days} unit={d.streak.days === 1 ? 'dia' : 'dias'} sub={d.streak.liftWeeks ? `${d.streak.liftWeeks} sem. batendo a musculação` : 'dias cumprindo plano + registro'} />
        <Stat label="Musculação na semana" value={`${d.week.lifts.done}/${d.week.lifts.target}`} sub={`esportes: ${d.week.sports.done}/${d.week.sports.planned}`} />
        <Stat label="Calorias ativas" value={d.energy.device?.active_calories != null ? n0(d.energy.device.active_calories) : '–'} unit="kcal" sub={d.energy.device ? 'informado do relógio' : <Link to="/dieta?tab=energia">registrar Garmin</Link>} />
      </div>

      <Card title="Balanço energético estimado" icon={<Flame size={18} />} className="" action={<span className="chip">{CONFIDENCE_LABEL[bal.confidence]}</span>}>
        <div className="row between">
          <div>
            <div className="xs muted">Gasto estimado</div>
            <div className="tabular" style={{ fontWeight: 650 }}>
              ~{n0(bal.expenditure.value)} kcal
            </div>
          </div>
          <div>
            <div className="xs muted">Consumo registrado</div>
            <div className="tabular" style={{ fontWeight: 650 }}>{n0(bal.intake)} kcal</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="xs muted">{bal.insufficient ? 'Balanço' : bal.label === 'deficit' ? 'Déficit estimado' : bal.label === 'superavit' ? 'Superávit estimado' : 'Perto da manutenção'}</div>
            <div className="tabular" style={{ fontWeight: 650 }}>
              {bal.insufficient ? 'aguardando registros' : balanceRange(bal)}
            </div>
          </div>
        </div>
        {bal.warnings.map((w: string) => (
          <p key={w} className="xs warn" style={{ margin: '8px 0 0', color: 'var(--warn-text)' }}>
            {w}
          </p>
        ))}
        <Disclaimer>{bal.expenditure.method}. É uma faixa, não uma medição — use a tendência do peso médio para decidir ajustes.</Disclaimer>
      </Card>

      {d.isSunday && (
        <Link to="/performance?tab=relatorio" className="card row" style={{ marginTop: 12, color: 'inherit' }}>
          <Sparkles size={20} color="var(--accent)" />
          <div className="grow">
            <b>Seu resumo da semana está pronto</b>
            <div className="xs muted">Peso médio, adesão, treinos e pontos de atenção</div>
          </div>
          <ChevronRight size={18} />
        </Link>
      )}

      {d.insights.length > 0 && (
        <>
          <div className="section-label">Observações</div>
          <Card>
            {d.insights.map((i: any) => (
              <div className="insight" key={i.id}>
                {i.level === 'atencao' ? <AlertTriangle size={18} color="var(--warn-text)" /> : i.level === 'positivo' ? <ThumbsUp size={18} color="var(--good-text)" /> : <Zap size={18} color="var(--accent)" />}
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{i.title}</div>
                  <div className="small sec">{i.message}</div>
                  <div className="xs muted" style={{ marginTop: 4 }}>
                    Base: {i.evidence.join(' · ')}
                  </div>
                </div>
              </div>
            ))}
            <Disclaimer>Sugestões automáticas com base nos seus registros. Não substituem nutricionista ou médico.</Disclaimer>
          </Card>
        </>
      )}

      <div className="row xs muted" style={{ justifyContent: 'center', marginTop: 16, gap: 6 }}>
        <Scale size={12} /> Peso inicial {n1(d.weight.initial)} kg · variação (média 7d) {signed(d.weight.changeFromStartAvg)} kg
      </div>

      <CheckinSheet open={checkin} onClose={closeCheckin} date={d.date} initial={d.recovery} />
    </>
  );
}
