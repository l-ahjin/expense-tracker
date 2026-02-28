import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import crypto from 'crypto'

let db

export function getDB() {
  if (!db) {
    const dbPath = path.join(app.getPath('userData'), 'expense-tracker.db')
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    initSchema()
  }
  return db
}

export function closeDB() {
  if (!db) return
  try {
    // Flush WAL as much as possible before closing.
    db.pragma('wal_checkpoint(TRUNCATE)')
  } catch {}
  try {
    db.close()
  } finally {
    db = undefined
  }
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS asset_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT '일반' CHECK(type IN ('일반', '신용카드', '체크카드')),
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      asset_group_id INTEGER REFERENCES asset_groups(id) ON DELETE SET NULL,
      is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      template_id INTEGER REFERENCES parser_templates(id) ON DELETE SET NULL,
      linked_asset_id INTEGER REFERENCES assets(id) ON DELETE SET NULL,
      credit_template_id INTEGER REFERENCES parser_templates(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS asset_match_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      type_match_code TEXT NOT NULL,
      description_match_keyword TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      type TEXT CHECK(type IN ('수입', '지출', '이체')),
      flow_policy TEXT NOT NULL DEFAULT 'BOTH' CHECK(flow_policy IN ('FIXED_IN', 'FIXED_OUT', 'BOTH')),
      sort_order INTEGER DEFAULT 0,
      is_system INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      CHECK (
        (type = '이체' AND flow_policy = 'BOTH')
        OR (type IN ('수입', '지출') AND flow_policy IN ('FIXED_IN', 'FIXED_OUT'))
      )
    );

    CREATE TABLE IF NOT EXISTS parser_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      connection_type TEXT NOT NULL CHECK(connection_type IN ('은행/체크카드', '신용카드')),
      password TEXT,
      memo TEXT,
      start_row INTEGER NOT NULL DEFAULT 1,
      amount_type TEXT NOT NULL CHECK(amount_type IN ('split', 'single', 'expense_only')),
      col_date TEXT NOT NULL,
      col_description TEXT NOT NULL,
      col_amount TEXT,
      col_amount_in TEXT,
      col_amount_out TEXT,
      col_balance TEXT,
      col_type TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS excel_imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      filename TEXT NOT NULL,
      file_id INTEGER,
      last_modified_at INTEGER,
      content_hash TEXT,
      asset_id INTEGER REFERENCES assets(id) ON DELETE SET NULL,
      template_id INTEGER REFERENCES parser_templates(id) ON DELETE SET NULL,
      row_count INTEGER DEFAULT 0,
      saved_count INTEGER,
      imported_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      amount INTEGER NOT NULL CHECK(amount >= 0),
      direction TEXT NOT NULL CHECK(direction IN ('INFLOW', 'OUTFLOW')),
      asset_id INTEGER REFERENCES assets(id) ON DELETE SET NULL,
      balance INTEGER,
      description TEXT,
      memo TEXT,
      is_excluded INTEGER DEFAULT 0,
      import_id INTEGER REFERENCES excel_imports(id) ON DELETE SET NULL,
      synced_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL DEFAULT 'google_sheets',
      started_at TEXT DEFAULT (datetime('now')),
      finished_at TEXT,
      status TEXT NOT NULL CHECK(status IN ('running', 'success', 'partial', 'failed')),
      spreadsheet_id TEXT,
      transactions_sheet_name TEXT,
      categories_sheet_name TEXT,
      assets_sheet_name TEXT,
      total_inserted INTEGER DEFAULT 0,
      total_updated INTEGER DEFAULT 0,
      total_skipped INTEGER DEFAULT 0,
      total_deleted INTEGER DEFAULT 0,
      total_failed INTEGER DEFAULT 0,
      error_message TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sync_run_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('transactions', 'categories', 'assets')),
      sheet_name TEXT,
      started_at TEXT DEFAULT (datetime('now')),
      finished_at TEXT,
      status TEXT NOT NULL CHECK(status IN ('waiting', 'running', 'success', 'failed', 'skipped')),
      rows_total INTEGER DEFAULT 0,
      rows_inserted INTEGER DEFAULT 0,
      rows_updated INTEGER DEFAULT 0,
      rows_skipped INTEGER DEFAULT 0,
      rows_deleted INTEGER DEFAULT 0,
      rows_failed INTEGER DEFAULT 0,
      error_message TEXT,
      details_json TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sync_change_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('transactions', 'categories', 'asset_groups', 'assets')),
      entity_id TEXT NOT NULL,
      op TEXT NOT NULL CHECK(op IN ('insert', 'update', 'delete')),
      created_at TEXT DEFAULT (datetime('now')),
      processed_at TEXT,
      run_id INTEGER REFERENCES sync_runs(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS keyword_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword TEXT NOT NULL,
      match_type TEXT NOT NULL CHECK(match_type IN ('전체일치', '부분일치')),
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      amount INTEGER,
      priority INTEGER DEFAULT 10,
      match_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      is_encrypted INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_asset_id ON transactions(asset_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_direction ON transactions(direction);
    CREATE INDEX IF NOT EXISTS idx_sync_runs_started_at ON sync_runs(started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sync_runs_status ON sync_runs(status);
    CREATE INDEX IF NOT EXISTS idx_sync_run_items_run_id ON sync_run_items(run_id);
    CREATE INDEX IF NOT EXISTS idx_sync_run_items_entity_type ON sync_run_items(entity_type);
    CREATE INDEX IF NOT EXISTS idx_sync_change_log_entity ON sync_change_log(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_sync_change_log_pending ON sync_change_log(entity_type, processed_at, id);
    CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);
    CREATE INDEX IF NOT EXISTS idx_assets_linked_asset_id ON assets(linked_asset_id);
    CREATE INDEX IF NOT EXISTS idx_asset_match_rules_asset_id ON asset_match_rules(asset_id);
    CREATE INDEX IF NOT EXISTS idx_asset_groups_sort ON asset_groups(sort_order);
    CREATE INDEX IF NOT EXISTS idx_assets_sort ON assets(sort_order);
  `)

  migrateSyncSchema()
  migrateSyncChangeLogSchema()
  migrateParserTemplateSchema()
  seedAssetGroups()
  seedSystemCategories()
  seedDefaultSettings()
}

function hasColumn(table, column) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all()
  return rows.some((row) => row.name === column)
}

function migrateSyncSchema() {
  if (!hasColumn('sync_runs', 'asset_groups_sheet_name')) {
    db.prepare('ALTER TABLE sync_runs ADD COLUMN asset_groups_sheet_name TEXT').run()
  }
  if (!hasColumn('sync_runs', 'total_deleted')) {
    db.prepare('ALTER TABLE sync_runs ADD COLUMN total_deleted INTEGER DEFAULT 0').run()
  }
  if (!hasColumn('sync_run_items', 'rows_deleted')) {
    db.prepare('ALTER TABLE sync_run_items ADD COLUMN rows_deleted INTEGER DEFAULT 0').run()
  }

  // Expand entity_type CHECK to include asset_groups by recreating the table once.
  const createSqlRow = db.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'sync_run_items'
  `).get()
  const createSql = String(createSqlRow?.sql ?? '')
  if (createSql.includes("'asset_groups'")) return

  db.exec(`
    ALTER TABLE sync_run_items RENAME TO sync_run_items_old;

    CREATE TABLE sync_run_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('transactions', 'categories', 'asset_groups', 'assets')),
      sheet_name TEXT,
      started_at TEXT DEFAULT (datetime('now')),
      finished_at TEXT,
      status TEXT NOT NULL CHECK(status IN ('waiting', 'running', 'success', 'failed', 'skipped')),
      rows_total INTEGER DEFAULT 0,
      rows_inserted INTEGER DEFAULT 0,
      rows_updated INTEGER DEFAULT 0,
      rows_skipped INTEGER DEFAULT 0,
      rows_deleted INTEGER DEFAULT 0,
      rows_failed INTEGER DEFAULT 0,
      error_message TEXT,
      details_json TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    INSERT INTO sync_run_items (
      id, run_id, entity_type, sheet_name, started_at, finished_at, status,
      rows_total, rows_inserted, rows_updated, rows_skipped, rows_deleted, rows_failed,
      error_message, details_json, created_at
    )
    SELECT
      id, run_id, entity_type, sheet_name, started_at, finished_at, status,
      rows_total, rows_inserted, rows_updated, rows_skipped, 0 AS rows_deleted, rows_failed,
      error_message, details_json, created_at
    FROM sync_run_items_old;

    DROP TABLE sync_run_items_old;

    CREATE INDEX IF NOT EXISTS idx_sync_run_items_run_id ON sync_run_items(run_id);
    CREATE INDEX IF NOT EXISTS idx_sync_run_items_entity_type ON sync_run_items(entity_type);
  `)
}

function migrateSyncChangeLogSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_change_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('transactions', 'categories', 'asset_groups', 'assets')),
      entity_id TEXT NOT NULL,
      op TEXT NOT NULL CHECK(op IN ('insert', 'update', 'delete')),
      created_at TEXT DEFAULT (datetime('now')),
      processed_at TEXT,
      run_id INTEGER REFERENCES sync_runs(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sync_change_log_entity ON sync_change_log(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_sync_change_log_pending ON sync_change_log(entity_type, processed_at, id);

    CREATE TRIGGER IF NOT EXISTS trg_sync_categories_ai
    AFTER INSERT ON categories
    BEGIN
      INSERT INTO sync_change_log (entity_type, entity_id, op)
      VALUES ('categories', CAST(NEW.id AS TEXT), 'insert');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_sync_categories_au
    AFTER UPDATE ON categories
    BEGIN
      INSERT INTO sync_change_log (entity_type, entity_id, op)
      VALUES ('categories', CAST(NEW.id AS TEXT), 'update');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_sync_categories_ad
    AFTER DELETE ON categories
    BEGIN
      INSERT INTO sync_change_log (entity_type, entity_id, op)
      VALUES ('categories', CAST(OLD.id AS TEXT), 'delete');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_sync_asset_groups_ai
    AFTER INSERT ON asset_groups
    BEGIN
      INSERT INTO sync_change_log (entity_type, entity_id, op)
      VALUES ('asset_groups', CAST(NEW.id AS TEXT), 'insert');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_sync_asset_groups_au
    AFTER UPDATE ON asset_groups
    BEGIN
      INSERT INTO sync_change_log (entity_type, entity_id, op)
      VALUES ('asset_groups', CAST(NEW.id AS TEXT), 'update');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_sync_asset_groups_ad
    AFTER DELETE ON asset_groups
    BEGIN
      INSERT INTO sync_change_log (entity_type, entity_id, op)
      VALUES ('asset_groups', CAST(OLD.id AS TEXT), 'delete');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_sync_assets_ai
    AFTER INSERT ON assets
    BEGIN
      INSERT INTO sync_change_log (entity_type, entity_id, op)
      VALUES ('assets', CAST(NEW.id AS TEXT), 'insert');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_sync_assets_au
    AFTER UPDATE ON assets
    BEGIN
      INSERT INTO sync_change_log (entity_type, entity_id, op)
      VALUES ('assets', CAST(NEW.id AS TEXT), 'update');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_sync_assets_ad
    AFTER DELETE ON assets
    BEGIN
      INSERT INTO sync_change_log (entity_type, entity_id, op)
      VALUES ('assets', CAST(OLD.id AS TEXT), 'delete');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_sync_transactions_ai
    AFTER INSERT ON transactions
    BEGIN
      INSERT INTO sync_change_log (entity_type, entity_id, op)
      VALUES ('transactions', CAST(NEW.id AS TEXT), 'insert');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_sync_transactions_au
    AFTER UPDATE ON transactions
    BEGIN
      INSERT INTO sync_change_log (entity_type, entity_id, op)
      VALUES ('transactions', CAST(NEW.id AS TEXT), 'update');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_sync_transactions_ad
    AFTER DELETE ON transactions
    BEGIN
      INSERT INTO sync_change_log (entity_type, entity_id, op)
      VALUES ('transactions', CAST(OLD.id AS TEXT), 'delete');
    END;
  `)
}

function migrateParserTemplateSchema() {
  if (!hasColumn('parser_templates', 'memo')) {
    db.prepare('ALTER TABLE parser_templates ADD COLUMN memo TEXT').run()
  }
}

function seedAssetGroups() {
  const count = db.prepare('SELECT COUNT(*) as cnt FROM asset_groups').get()
  if (count.cnt > 0) return
  const insert = db.prepare('INSERT INTO asset_groups (name, type, sort_order) VALUES (?, ?, ?)')
  const seed = db.transaction(() => {
    insert.run('은행', '일반', 0)
    insert.run('신용카드', '신용카드', 1)
    insert.run('체크카드', '체크카드', 2)
  })
  seed()
}

function seedSystemCategories() {
  const existing = db.prepare(`SELECT id FROM categories WHERE is_system = 1 AND name = '카드 대금'`).get()
  if (existing) return
  db.prepare(`
    INSERT INTO categories (name, type, flow_policy, parent_id, sort_order, is_system)
    VALUES ('카드 대금', '이체', 'BOTH', NULL, 0, 1)
  `).run()
}

function seedDefaultSettings() {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO settings (key, value, is_encrypted)
    VALUES (?, ?, 0)
  `)

  insert.run('timezone_mode', JSON.stringify('system'))
  insert.run('time_format_24h', JSON.stringify(true))
  insert.run('google_sheets', JSON.stringify({
    auth_type: 'service_account',
    service_account_json: '',
    service_account_file_name: '',
    service_account_email: '',
    spreadsheet_id: '',
    sheet_names: {
      transactions: '거래 내역',
      categories: '카테고리',
      asset_groups: '자산 그룹',
      assets: '자산',
    },
  }))
}

export function getCardPaymentCategoryId() {
  const row = db.prepare(`SELECT id FROM categories WHERE is_system = 1 AND name = '카드 대금'`).get()
  return row?.id ?? null
}

export function generateTransactionId(date, amount, assetId, balance, description, direction = null) {
  // Keep hash compatibility with legacy signed-amount IDs by canonicalizing to signed amount.
  const signedAmount = direction
    ? (direction === 'INFLOW' ? Math.abs(amount) : -Math.abs(amount))
    : amount
  const raw = `${date}|${signedAmount}|${assetId}|${balance}|${description}`
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16)
}
