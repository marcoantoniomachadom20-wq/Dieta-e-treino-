-- Esquema inicial. Todas as tabelas de dados pessoais têm user_id (pronto para multiusuário).
-- Datas de domínio: TEXT 'YYYY-MM-DD' (dia local do usuário). Timestamps: TEXT ISO-8601 UTC.

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  age INTEGER NOT NULL,
  sex TEXT NOT NULL CHECK (sex IN ('masculino','feminino')),
  height_cm REAL NOT NULL,
  initial_weight_kg REAL NOT NULL,
  goal TEXT NOT NULL DEFAULT 'perda_gordura',
  goal_notes TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  lift_target_per_week INTEGER NOT NULL DEFAULT 3,
  lift_availability TEXT NOT NULL, -- JSON {weekday: SlotId[]}
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY, -- sha256 do token (o token em si só existe no cookie)
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- Metas nutricionais com vigência: o histórico de aderência usa a meta válida em cada dia.
CREATE TABLE nutrition_targets (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  effective_from TEXT NOT NULL,
  calories REAL NOT NULL,
  protein REAL NOT NULL,
  carbs REAL NOT NULL,
  fat REAL NOT NULL,
  water_ml REAL NOT NULL,
  notes TEXT,
  UNIQUE(user_id, effective_from)
);

-- Rotina esportiva fixa da semana (modelo usado para gerar a agenda).
CREATE TABLE schedule_template (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  type TEXT NOT NULL,
  time TEXT,
  duration_min INTEGER,
  optional INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

CREATE TABLE workout_templates (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  focus TEXT NOT NULL,
  lower_load REAL NOT NULL,
  upper_load REAL NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(user_id, code)
);

CREATE TABLE template_exercises (
  id INTEGER PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  sets INTEGER NOT NULL,
  rep_min INTEGER NOT NULL,
  rep_max INTEGER NOT NULL,
  rest_s INTEGER NOT NULL DEFAULT 90,
  lower INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

-- Sessões (planejadas e realizadas) de qualquer modalidade.
CREATE TABLE workouts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('musculacao','futevolei','tenis','recuperacao','outro')),
  template_id INTEGER REFERENCES workout_templates(id) ON DELETE SET NULL,
  date TEXT NOT NULL,
  planned_time TEXT,
  planned_slot TEXT,
  optional INTEGER NOT NULL DEFAULT 0,
  origin TEXT NOT NULL DEFAULT 'manual' CHECK (origin IN ('plano','manual')),
  status TEXT NOT NULL DEFAULT 'planejado' CHECK (status IN ('planejado','em_andamento','concluido','pulado')),
  started_at TEXT,
  finished_at TEXT,
  duration_min REAL,
  rpe INTEGER CHECK (rpe BETWEEN 1 AND 10),
  calories REAL,
  avg_hr INTEGER,
  intensity TEXT,
  games INTEGER,
  performance_rating INTEGER CHECK (performance_rating BETWEEN 1 AND 5),
  volume_kg REAL,
  plan_reason TEXT,
  locked INTEGER NOT NULL DEFAULT 0, -- movido manualmente: o replanejamento não mexe
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_workouts_user_date ON workouts(user_id, date);

CREATE TABLE workout_exercises (
  id INTEGER PRIMARY KEY,
  workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  target_sets INTEGER NOT NULL,
  rep_min INTEGER,
  rep_max INTEGER,
  lower INTEGER NOT NULL DEFAULT 0,
  suggested_weight REAL,
  suggestion TEXT,
  completed INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

CREATE TABLE exercise_sets (
  id INTEGER PRIMARY KEY,
  workout_exercise_id INTEGER NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
  set_number INTEGER NOT NULL,
  weight_kg REAL,
  reps INTEGER,
  rir INTEGER,
  completed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE food_items (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kcal_100 REAL NOT NULL,
  protein_100 REAL NOT NULL,
  carbs_100 REAL NOT NULL,
  fat_100 REAL NOT NULL,
  default_grams REAL NOT NULL DEFAULT 100,
  unit_label TEXT,
  favorite INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'usuario',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_food_items_user ON food_items(user_id, name);

CREATE TABLE meal_photos (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  analysis_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Macros gravados como "foto" no momento do registro: editar a biblioteca não reescreve o passado.
CREATE TABLE food_entries (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  meal TEXT NOT NULL,
  food_item_id INTEGER REFERENCES food_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  quantity_g REAL NOT NULL,
  calories REAL NOT NULL,
  protein REAL NOT NULL,
  carbs REAL NOT NULL,
  fat REAL NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','biblioteca','foto_ia','favorita')),
  meal_photo_id INTEGER REFERENCES meal_photos(id) ON DELETE SET NULL,
  ai_confidence REAL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_food_entries_user_date ON food_entries(user_id, date);

CREATE TABLE favorite_meals (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  meal TEXT NOT NULL,
  items_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE water_entries (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  ml REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_water_user_date ON water_entries(user_id, date);

CREATE TABLE weight_entries (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  weight_kg REAL NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(user_id, date)
);

CREATE TABLE body_measurements (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  waist REAL,
  abdomen REAL,
  chest REAL,
  arm REAL,
  thigh REAL,
  body_fat REAL,
  body_fat_method TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(user_id, date)
);

CREATE TABLE progress_photos (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  pose TEXT NOT NULL CHECK (pose IN ('frontal','lateral','posterior')),
  file_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  weight_kg REAL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_progress_photos_user_date ON progress_photos(user_id, date);

CREATE TABLE recovery_checkins (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  sleep_hours REAL,
  sleep_quality INTEGER NOT NULL CHECK (sleep_quality BETWEEN 1 AND 5),
  energy INTEGER NOT NULL CHECK (energy BETWEEN 1 AND 5),
  soreness INTEGER NOT NULL CHECK (soreness BETWEEN 1 AND 5),
  stress INTEGER NOT NULL CHECK (stress BETWEEN 1 AND 5),
  motivation INTEGER NOT NULL CHECK (motivation BETWEEN 1 AND 5),
  score INTEGER NOT NULL,
  status TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(user_id, date)
);

-- Dados de gasto energético (hoje manuais; no futuro, de integrações).
CREATE TABLE energy_logs (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  active_calories REAL,
  total_calories REAL,
  steps INTEGER,
  avg_hr INTEGER,
  activity_minutes REAL,
  workout_calories REAL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(user_id, date, source)
);

CREATE TABLE goals (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  horizon TEXT NOT NULL CHECK (horizon IN ('curto','medio','longo')),
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  target_value REAL NOT NULL,
  start_value REAL,
  current_manual REAL,
  unit TEXT,
  exercise_name TEXT,
  deadline TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Semanas para as quais a agenda já foi gerada (evita regenerar o que o usuário apagou).
CREATE TABLE planned_weeks (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, week_start)
);
