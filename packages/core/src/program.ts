/**
 * Programa base de musculação para um atleta de esportes de areia/quadra.
 * Três sessões full body com ênfases diferentes, em vez de uma divisão por grupamento,
 * porque futvôlei e tênis já impõem carga alta de membros inferiores e de ombro durante a semana.
 */
export interface ProgramExercise {
  name: string;
  sets: number;
  rep_min: number;
  rep_max: number;
  rest_s: number;
  /** Exercício que gera fadiga relevante de membros inferiores. */
  lower: boolean;
  notes?: string;
}

export interface ProgramTemplate {
  code: 'A' | 'B' | 'C';
  name: string;
  focus: string;
  /** 0–1: quanto a sessão fadiga membros inferiores / superiores (usado pelo planejador). */
  lower_load: number;
  upper_load: number;
  exercises: ProgramExercise[];
}

export const DEFAULT_PROGRAM: ProgramTemplate[] = [
  {
    code: 'A',
    name: 'Musculação A',
    focus: 'Full body · foco superior',
    lower_load: 0.25,
    upper_load: 1,
    exercises: [
      { name: 'Supino reto com barra', sets: 4, rep_min: 8, rep_max: 10, rest_s: 120, lower: false },
      { name: 'Remada curvada', sets: 4, rep_min: 8, rep_max: 12, rest_s: 120, lower: false },
      { name: 'Desenvolvimento com halteres', sets: 3, rep_min: 8, rep_max: 12, rest_s: 90, lower: false },
      { name: 'Puxada frontal', sets: 3, rep_min: 8, rep_max: 12, rest_s: 90, lower: false },
      { name: 'Agachamento goblet', sets: 2, rep_min: 10, rep_max: 12, rest_s: 90, lower: true, notes: 'Leve, RIR 3+. Só para manter o padrão.' },
      { name: 'Face pull', sets: 3, rep_min: 12, rep_max: 15, rest_s: 60, lower: false, notes: 'Saúde do ombro (saque/smash).' },
      { name: 'Rosca direta', sets: 2, rep_min: 10, rep_max: 12, rest_s: 60, lower: false },
      { name: 'Tríceps na polia (corda)', sets: 2, rep_min: 10, rep_max: 12, rest_s: 60, lower: false },
    ],
  },
  {
    code: 'B',
    name: 'Musculação B',
    focus: 'Full body · foco inferior',
    lower_load: 1,
    upper_load: 0.35,
    exercises: [
      { name: 'Agachamento livre', sets: 4, rep_min: 5, rep_max: 8, rest_s: 180, lower: true },
      { name: 'Levantamento terra romeno', sets: 3, rep_min: 6, rep_max: 10, rest_s: 150, lower: true },
      { name: 'Agachamento búlgaro', sets: 3, rep_min: 8, rep_max: 10, rest_s: 90, lower: true, notes: 'Reps por perna.' },
      { name: 'Mesa flexora', sets: 3, rep_min: 10, rep_max: 12, rest_s: 75, lower: true, notes: 'Prevenção de lesão de posterior em sprints.' },
      { name: 'Panturrilha em pé', sets: 3, rep_min: 10, rep_max: 15, rest_s: 60, lower: true },
      { name: 'Supino inclinado com halteres', sets: 3, rep_min: 8, rep_max: 12, rest_s: 90, lower: false },
      { name: 'Pallof press', sets: 3, rep_min: 10, rep_max: 12, rest_s: 45, lower: false, notes: 'Anti-rotação do core.' },
    ],
  },
  {
    code: 'C',
    name: 'Musculação C',
    focus: 'Full body · equilibrado',
    lower_load: 0.6,
    upper_load: 0.7,
    exercises: [
      { name: 'Hip thrust', sets: 3, rep_min: 8, rep_max: 12, rest_s: 120, lower: true },
      { name: 'Supino com halteres', sets: 3, rep_min: 8, rep_max: 12, rest_s: 90, lower: false },
      { name: 'Barra fixa', sets: 3, rep_min: 6, rep_max: 10, rest_s: 120, lower: false, notes: 'Use a puxada se não completar 6.' },
      { name: 'Leg press', sets: 3, rep_min: 10, rep_max: 12, rest_s: 120, lower: true },
      { name: 'Remada unilateral com halter', sets: 3, rep_min: 8, rep_max: 12, rest_s: 75, lower: false },
      { name: 'Elevação lateral', sets: 3, rep_min: 12, rep_max: 15, rest_s: 60, lower: false },
      { name: 'Rotação externa com elástico', sets: 2, rep_min: 12, rep_max: 15, rest_s: 45, lower: false, notes: 'Manguito rotador (tênis).' },
    ],
  },
];
