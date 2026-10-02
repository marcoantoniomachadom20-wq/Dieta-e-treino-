import { todayInTz, timeInTz, type NutritionTargets, type Sex, type SlotId } from '@app/core';
import type { DB } from '../db';

export interface UserRow {
  id: number;
  email: string;
  name: string;
  age: number;
  sex: Sex;
  height_cm: number;
  initial_weight_kg: number;
  goal: 'perda_gordura' | 'recomposicao' | 'ganho_massa' | 'manutencao';
  goal_notes: string | null;
  timezone: string;
  lift_target_per_week: number;
  lift_availability: string;
  created_at: string;
}

export function getUser(db: DB, id: number): UserRow {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  if (!u) throw Object.assign(new Error('Usuário não encontrado'), { statusCode: 404 });
  return u;
}

export function publicUser(u: UserRow) {
  // Nunca expor o hash da senha.
  const { lift_availability, password_hash: _omit, ...rest } = u as UserRow & { password_hash?: string };
  return { ...rest, lift_availability: JSON.parse(lift_availability) as Record<number, SlotId[]> };
}

export const userToday = (u: UserRow) => todayInTz(u.timezone);
export const userNowTime = (u: UserRow) => timeInTz(u.timezone);

export function targetsFor(db: DB, userId: number, date: string): NutritionTargets {
  const row = db
    .prepare(
      `SELECT calories, protein, carbs, fat, water_ml FROM nutrition_targets
       WHERE user_id = ? AND effective_from <= ? ORDER BY effective_from DESC LIMIT 1`,
    )
    .get(userId, date) as NutritionTargets | undefined;
  if (row) return row;
  // Data anterior à primeira meta: usa a mais antiga.
  return db
    .prepare('SELECT calories, protein, carbs, fat, water_ml FROM nutrition_targets WHERE user_id = ? ORDER BY effective_from ASC LIMIT 1')
    .get(userId) as NutritionTargets;
}

export function latestWeight(db: DB, userId: number, upTo?: string): { date: string; weight_kg: number } | null {
  return (
    (db
      .prepare(`SELECT date, weight_kg FROM weight_entries WHERE user_id = ? ${upTo ? 'AND date <= ?' : ''} ORDER BY date DESC LIMIT 1`)
      .get(...(upTo ? [userId, upTo] : [userId])) as { date: string; weight_kg: number } | undefined) ?? null
  );
}

export function httpError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}
