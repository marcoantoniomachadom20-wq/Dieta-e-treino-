import { DEFAULT_PROGRAM, DEFAULT_AVAILABILITY, defaultWaterMl, type Sex } from '@app/core';
import type { DB } from './db';
import { SEED_FOODS } from './data/foods';

export interface NewUser {
  email: string;
  password_hash: string;
  name: string;
  age: number;
  sex: Sex;
  height_cm: number;
  initial_weight_kg: number;
  goal: string;
  timezone: string;
}

/** Cria o usuário com a configuração inicial descrita no briefing (rotina, programa, metas, biblioteca). */
export function createUserWithDefaults(db: DB, u: NewUser, today: string): number {
  return db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO users (email, password_hash, name, age, sex, height_cm, initial_weight_kg, goal, timezone, lift_availability)
         VALUES (@email, @password_hash, @name, @age, @sex, @height_cm, @initial_weight_kg, @goal, @timezone, @availability)`,
      )
      .run({ ...u, availability: JSON.stringify(DEFAULT_AVAILABILITY) });
    const userId = Number(info.lastInsertRowid);

    // Metas nutricionais iniciais (configuráveis). Ponto de partida, não prescrição.
    db.prepare(
      `INSERT INTO nutrition_targets (user_id, effective_from, calories, protein, carbs, fat, water_ml, notes)
       VALUES (?, ?, 2350, 160, 260, 70, ?, 'Meta inicial do briefing: 2.300–2.400 kcal, 150–165 g de proteína.')`,
    ).run(userId, today, defaultWaterMl(u.initial_weight_kg));

    // Rotina esportiva fixa.
    const sched = db.prepare('INSERT INTO schedule_template (user_id, weekday, type, time, duration_min, optional, notes) VALUES (?, ?, ?, ?, ?, ?, ?)');
    sched.run(userId, 1, 'futevolei', '19:30', 90, 0, null);
    sched.run(userId, 2, 'tenis', '19:00', 90, 0, null);
    sched.run(userId, 3, 'futevolei', '19:30', 90, 0, null);
    sched.run(userId, 4, 'tenis', '19:00', 90, 0, null);
    sched.run(userId, 5, 'futevolei', '12:00', 60, 1, 'Jogo possível ao meio-dia');

    // Programa A/B/C.
    const tpl = db.prepare('INSERT INTO workout_templates (user_id, code, name, focus, lower_load, upper_load) VALUES (?, ?, ?, ?, ?, ?)');
    const ex = db.prepare(
      'INSERT INTO template_exercises (template_id, position, name, sets, rep_min, rep_max, rest_s, lower, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    for (const t of DEFAULT_PROGRAM) {
      const tid = Number(tpl.run(userId, t.code, t.name, t.focus, t.lower_load, t.upper_load).lastInsertRowid);
      t.exercises.forEach((e, i) => ex.run(tid, i, e.name, e.sets, e.rep_min, e.rep_max, e.rest_s, e.lower ? 1 : 0, e.notes ?? null));
    }

    // Biblioteca de alimentos.
    const food = db.prepare(
      `INSERT INTO food_items (user_id, name, kcal_100, protein_100, carbs_100, fat_100, default_grams, unit_label, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'base')`,
    );
    for (const f of SEED_FOODS) food.run(userId, f.name, f.kcal, f.p, f.c, f.f, f.g, f.unit ?? null);

    // Metas de curto/médio/longo prazo.
    const goal = db.prepare(
      'INSERT INTO goals (user_id, horizon, kind, title, target_value, start_value, unit, exercise_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    );
    goal.run(userId, 'curto', 'musculacao_semana', 'Treinar musculação 3x na semana', 3, null, 'sessões', null);
    goal.run(userId, 'curto', 'proteina_semana', 'Bater a proteína em 6 dias', 6, null, 'dias', null);
    goal.run(userId, 'curto', 'registro_semana', 'Registrar a alimentação todos os dias', 7, null, 'dias', null);
    goal.run(userId, 'curto', 'sono_semana', 'Dormir 7,5 h em média', 7.5, null, 'h', null);
    goal.run(userId, 'medio', 'peso_alvo', 'Chegar a 72 kg (média 7 dias)', 72, u.initial_weight_kg, 'kg', null);
    goal.run(userId, 'medio', 'treinos_mes', '20 sessões no mês (todas as modalidades)', 20, null, 'sessões', null);
    goal.run(userId, 'longo', 'cintura_alvo', 'Reduzir a cintura (defina o valor inicial em Evolução)', 78, null, 'cm', null);
    return userId;
  })();
}
