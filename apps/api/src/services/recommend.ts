import { ACTIVITY_LABELS, type ActivityType, type RecoveryStatus } from '@app/core';

interface TodaySession {
  type: ActivityType;
  planned_time: string | null;
  status: string;
  optional: number;
  template_code?: string | null;
}

/** Recomendação simples do dia, a partir da agenda e da recuperação. Linguagem de sugestão, não prescrição. */
export function dailyRecommendation(sessions: TodaySession[], recovery: RecoveryStatus | null, weekday: number): string {
  const pending = sessions.filter((s) => s.status === 'planejado' || s.status === 'em_andamento');
  const describe = (s: TodaySession) => {
    const name = s.type === 'musculacao' && s.template_code ? `musculação ${s.template_code}` : ACTIVITY_LABELS[s.type].toLowerCase();
    return `${name}${s.planned_time ? ` às ${s.planned_time.replace(':00', 'h')}` : ''}${s.optional ? ' (opcional)' : ''}`;
  };
  if (!pending.length) {
    if (recovery === 'baixa') return 'Nada planejado hoje e sua recuperação está baixa: aproveite para descansar e dormir bem.';
    if (weekday === 0 || weekday === 6)
      return 'Dia livre. Se estiver bem, 20–40 min de atividade leve (caminhada, bike, mobilidade) ajudam na recuperação ativa.';
    return 'Nada pendente para hoje. Foque em bater a proteína e dormir bem.';
  }
  const agenda = `Hoje você tem ${pending.map(describe).join(' e ')}.`;
  const lift = pending.find((s) => s.type === 'musculacao');
  const sport = pending.find((s) => s.type !== 'musculacao');
  if (recovery === 'baixa') {
    return `${agenda} Sua recuperação está abaixo do habitual. ${lift ? 'Considere reduzir o volume da musculação hoje' : 'Considere uma intensidade menor'}${sport && lift ? ' e priorizar o esporte' : ''}.`;
  }
  if (recovery === 'moderada') {
    return `${agenda} Recuperação moderada: mantenha o planejado, mas sem treinar até a falha.`;
  }
  if (recovery === 'boa') return `${agenda} Como sua recuperação está boa, mantenha o treino planejado.`;
  return `${agenda} Faça o check-in de recuperação para ajustar a recomendação.`;
}
