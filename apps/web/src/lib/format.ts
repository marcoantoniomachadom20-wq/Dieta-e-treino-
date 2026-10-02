import { WEEKDAY_NAMES } from '@app/core';

const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

export const n0 = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? '–' : nf0.format(v));
export const n1 = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? '–' : nf1.format(v));
export const signed = (v: number | null | undefined, digits = 1) =>
  v == null ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${(digits ? nf1 : nf0).format(Math.abs(v))}`;

export function dateLabel(iso: string, opts: { weekday?: boolean; year?: boolean } = {}) {
  const [y, m, d] = iso.split('-');
  const wd = opts.weekday ? `${WEEKDAY_NAMES[new Date(iso + 'T12:00:00Z').getUTCDay()]}, ` : '';
  return `${wd}${d}/${m}${opts.year ? `/${y}` : ''}`;
}

export const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

export const ACTIVITY_COLOR: Record<string, string> = {
  musculacao: 'var(--c-lift)',
  futevolei: 'var(--c-futevolei)',
  tenis: 'var(--c-tenis)',
  recuperacao: 'var(--c-recovery)',
  outro: 'var(--text-muted)',
};

export const ACTIVITY_SHORT: Record<string, string> = {
  musculacao: 'Musculação',
  futevolei: 'Futvôlei',
  tenis: 'Tênis',
  recuperacao: 'Recuperação',
  outro: 'Outro',
};

export const CONFIDENCE_LABEL: Record<string, string> = { baixa: 'confiança baixa', media: 'confiança média', alta: 'confiança alta' };
