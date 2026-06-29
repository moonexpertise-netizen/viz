import initSqlJs from 'sql.js';
import fs from 'fs';

let SQL = null;
let dbInstance = null;
const DB_PATH = process.env.DB_PATH || './data.db';

// Initialiser sql.js et charger/créer la DB
export const initializeDatabase = async () => {
  if (dbInstance) return dbInstance;

  SQL = await initSqlJs();

  try {
    if (fs.existsSync(DB_PATH)) {
      const buffer = fs.readFileSync(DB_PATH);
      dbInstance = new SQL.Database(buffer);
    } else {
      dbInstance = new SQL.Database();
    }
  } catch (err) {
    console.error('Erreur chargement DB:', err);
    dbInstance = new SQL.Database();
  }

  return dbInstance;
};

// Sauvegarder la DB
const saveDatabase = () => {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    console.error('Erreur sauvegarde DB:', err);
  }
};

// Classe pour wrapper les statements
class PreparedStatement {
  constructor(sql) {
    this.sql = sql;
  }

  run(...params) {
    try {
      // Utiliser db.run() directement (comme dans le test qui fonctionne)
      dbInstance.run(this.sql, [...params]);

      // Récupérer last_insert_rowid via exec (testé et fonctionnel)
      const res = dbInstance.exec('SELECT last_insert_rowid() as id');
      const lastId = res[0]?.values?.[0]?.[0] ?? null;

      saveDatabase();

      console.log('✅ RUN - SQL:', this.sql.substring(0, 60), '| LastID:', lastId);
      return { lastInsertRowid: lastId, changes: 1 };
    } catch (err) {
      console.error('❌ Erreur RUN:', err.message);
      throw err;
    }
  }

  get(...params) {
    try {
      const stmt = dbInstance.prepare(this.sql);
      stmt.bind([...params]);

      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        console.log('✅ GET FOUND:', JSON.stringify(row).substring(0, 100));
        return row;
      }
      stmt.free();
      console.log('❌ GET NOT FOUND for params:', params);
      return null;
    } catch (err) {
      console.error('❌ GET ERROR:', err.message);
      return null;
    }
  }

  all(...params) {
    try {
      const stmt = dbInstance.prepare(this.sql);
      stmt.bind([...params]);

      const result = [];
      while (stmt.step()) {
        result.push(stmt.getAsObject());
      }
      stmt.free();
      console.log('📋 ALL - Found:', result.length, 'rows');
      return result;
    } catch (err) {
      console.error('❌ ALL ERROR:', err.message);
      return [];
    }
  }
}

// Classe wrapper DB
class Database {
  prepare(sql) {
    return new PreparedStatement(sql);
  }

  exec(sql) {
    try {
      return dbInstance.run(sql);
    } catch (err) {
      console.error('Erreur exec():', err);
    }
  }

  pragma(pragma) {
    dbInstance.run(`PRAGMA ${pragma}`);
  }
}

// Initialiser les tables
export const initDb = () => {
  if (!dbInstance) {
    throw new Error('Database not initialized');
  }

  try {
    dbInstance.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    dbInstance.run(`
      CREATE TABLE IF NOT EXISTS clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    dbInstance.run(`
      CREATE TABLE IF NOT EXISTS balances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER NOT NULL,
        period TEXT,
        filename TEXT,
        raw_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
      )
    `);

    dbInstance.run(`
      CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        balance_id INTEGER NOT NULL,
        type TEXT CHECK(type IN ('bilan', 'pl', 'ratios', 'cashflow', 'monthly', 'monthly_cashflow')),
        data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (balance_id) REFERENCES balances(id) ON DELETE CASCADE
      )
    `);

    dbInstance.run(`
      CREATE TABLE IF NOT EXISTS pl_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        config TEXT NOT NULL,
        is_default INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    dbInstance.run(`
      CREATE TABLE IF NOT EXISTS forecasts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        base_balance_id INTEGER NOT NULL,
        config TEXT NOT NULL,
        result TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
        FOREIGN KEY (base_balance_id) REFERENCES balances(id) ON DELETE CASCADE
      )
    `);

    dbInstance.run(`
      CREATE TABLE IF NOT EXISTS cashflow_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        balance_id INTEGER NOT NULL,
        method TEXT CHECK(method IN ('direct', 'indirect')) DEFAULT 'indirect',
        data TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (balance_id) REFERENCES balances(id) ON DELETE CASCADE
      )
    `);

    // Colonnes additionnelles sur balances (ALTER ignore si deja existantes)
    try { dbInstance.run(`ALTER TABLE balances ADD COLUMN period_start TEXT`); } catch(e) {}
    try { dbInstance.run(`ALTER TABLE balances ADD COLUMN period_end TEXT`); } catch(e) {}
    try { dbInstance.run(`ALTER TABLE balances ADD COLUMN fiscal_year INTEGER`); } catch(e) {}
    try { dbInstance.run('ALTER TABLE pl_templates ADD COLUMN client_id INTEGER'); } catch(e) {}

    saveDatabase();
    console.log('✅ Database schema initialized');
  } catch (err) {
    console.log('⚠️ Schema already exists or error:', err.message);
  }
};

// Exporter l'instance DB
export default new Database();
