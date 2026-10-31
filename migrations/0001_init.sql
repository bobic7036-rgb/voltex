CREATE TABLE IF NOT EXISTS users (
  telegram_id TEXT PRIMARY KEY,
  username TEXT NOT NULL DEFAULT 'Player',
  coins INTEGER NOT NULL DEFAULT 0 CHECK(coins >= 0),
  wallet_address TEXT,
  is_banned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  cost INTEGER NOT NULL DEFAULT 0 CHECK(cost >= 0),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS rewards (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  name TEXT NOT NULL,
  rarity TEXT NOT NULL,
  value INTEGER NOT NULL CHECK(value >= 0),
  weight INTEGER NOT NULL CHECK(weight > 0),
  emoji TEXT NOT NULL DEFAULT '✦'
);
CREATE TABLE IF NOT EXISTS inventory (
  instance_id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL REFERENCES users(telegram_id),
  reward_id TEXT NOT NULL,
  name TEXT NOT NULL,
  rarity TEXT NOT NULL,
  value INTEGER NOT NULL,
  emoji TEXT NOT NULL,
  obtained_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT NOT NULL,
  target_id TEXT,
  action TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_logs_created ON logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_user ON inventory(telegram_id);
INSERT OR IGNORE INTO cases(id,name,description,cost,active) VALUES
('starter','Starter case','Безкоштовний стартовий кейс',0,1),
('neon','Neon case','Кейс за ігрові монети',250,1),
('cosmic','Cosmic case','Рідкісні цифрові колекційні предмети',700,1);
INSERT OR IGNORE INTO rewards(id,case_id,name,rarity,value,weight,emoji) VALUES
('st_spark','starter','Spark','Common',30,60,'✦'),
('st_shard','starter','Neon shard','Rare',80,28,'◆'),
('st_core','starter','Voltex core','Epic',180,10,'⬡'),
('st_crown','starter','Nova crown','Legendary',400,2,'♛'),
('ne_chip','neon','Energy chip','Common',50,55,'◈'),
('ne_prism','neon','Prism','Rare',130,30,'◇'),
('ne_pulse','neon','Pulse orb','Epic',300,13,'◎'),
('ne_aurora','neon','Aurora relic','Legendary',850,2,'✧'),
('co_dust','cosmic','Cosmic dust','Common',120,50,'✦'),
('co_comet','cosmic','Comet fragment','Rare',280,32,'☄'),
('co_ring','cosmic','Orbit ring','Epic',650,15,'◉'),
('co_supernova','cosmic','Supernova','Legendary',1600,3,'✺');