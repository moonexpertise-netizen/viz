import initSqlJs from 'sql.js';

const SQL = await initSqlJs();
const db = new SQL.Database();

db.run('CREATE TABLE test (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)');

// Test 1: db.run avec paramètres
db.run('INSERT INTO test (name) VALUES (?)', ['Alice']);
console.log('After insert 1:');
console.log('  exec last_insert_rowid:', db.exec('SELECT last_insert_rowid()'));

// Test 2: prepare + step
const stmt = db.prepare('INSERT INTO test (name) VALUES (?)');
stmt.bind(['Bob']);
stmt.step();
stmt.free();
console.log('After insert 2:');
console.log('  exec last_insert_rowid:', JSON.stringify(db.exec('SELECT last_insert_rowid()')));

// Test 3: prepare + step pour SELECT last_insert_rowid
const idStmt = db.prepare('SELECT last_insert_rowid() as id');
idStmt.step();
console.log('  prepare+step last_insert_rowid:', idStmt.getAsObject());
idStmt.free();

// Test 4: sqlite_sequence
try {
  console.log('  sqlite_sequence:', JSON.stringify(db.exec('SELECT * FROM sqlite_sequence')));
} catch(e) {
  console.log('  sqlite_sequence error:', e.message);
}

// Test 5: what about db.getRowsModified?
console.log('  getRowsModified:', db.getRowsModified());

// Test 6: check all data
console.log('All data:', JSON.stringify(db.exec('SELECT * FROM test')));

db.close();
