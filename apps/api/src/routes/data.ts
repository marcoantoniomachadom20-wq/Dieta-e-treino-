import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app';
import { requireAuth } from '../auth';
import { getUser, publicUser } from '../services/users';

const TABLES = [
  'nutrition_targets',
  'schedule_template',
  'workout_templates',
  'workouts',
  'food_items',
  'food_entries',
  'favorite_meals',
  'water_entries',
  'weight_entries',
  'body_measurements',
  'progress_photos',
  'meal_photos',
  'recovery_checkins',
  'energy_logs',
  'goals',
] as const;

/** Exportação completa dos dados do usuário (portabilidade/backup pessoal). Fotos vão só como metadados. */
export async function dataRoutes(app: FastifyInstance, { db }: AppContext) {
  app.addHook('preHandler', requireAuth(db));
  app.get('/api/export', async (req, reply) => {
    const out: Record<string, unknown> = { exported_at: new Date().toISOString(), user: publicUser(getUser(db, req.userId)) };
    for (const t of TABLES) out[t] = db.prepare(`SELECT * FROM ${t} WHERE user_id = ?`).all(req.userId);
    out.template_exercises = db.prepare('SELECT te.* FROM template_exercises te JOIN workout_templates t ON t.id = te.template_id WHERE t.user_id = ?').all(req.userId);
    out.workout_exercises = db.prepare('SELECT we.* FROM workout_exercises we JOIN workouts w ON w.id = we.workout_id WHERE w.user_id = ?').all(req.userId);
    out.exercise_sets = db
      .prepare('SELECT s.* FROM exercise_sets s JOIN workout_exercises we ON we.id = s.workout_exercise_id JOIN workouts w ON w.id = we.workout_id WHERE w.user_id = ?')
      .all(req.userId);
    reply.header('Content-Disposition', `attachment; filename="performance-export-${new Date().toISOString().slice(0, 10)}.json"`);
    return out;
  });
}
