require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const { currency, groups, modules, seed } = require('./modules');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DB = process.env.DB_NAME || 'pos_system';
const conn = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
};
let pool;

const sqlType = {
  text: 'VARCHAR(255)', textarea: 'TEXT', number: 'DECIMAL(14,2) DEFAULT 0', int: 'INT DEFAULT 0',
  date: 'DATE', select: 'VARCHAR(40)', ref: 'INT',
};
const isNum = (f) => f.type === 'number' || f.type === 'int';
const wrap = (fn) => (req, res) =>
  fn(req, res).catch((e) => { console.error(e); res.status(500).json({ error: e.message }); });

// ---------- database setup (runs every start, safe to repeat) ----------
async function setup() {
  const c = await mysql.createConnection(conn);
  await c.query(`CREATE DATABASE IF NOT EXISTS \`${DB}\` CHARACTER SET utf8mb4`);
  await c.end();
  pool = mysql.createPool({ ...conn, database: DB, connectionLimit: 10, dateStrings: true, decimalNumbers: true });

  for (const [t, m] of Object.entries(modules)) {
    await pool.query(`CREATE TABLE IF NOT EXISTS \`${t}\` (id INT AUTO_INCREMENT PRIMARY KEY, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) CHARACTER SET utf8mb4`);
    const [cols] = await pool.query(`SHOW COLUMNS FROM \`${t}\``);
    const have = cols.map((x) => x.Field);
    for (const f of m.fields)
      if (!have.includes(f.name)) await pool.query(`ALTER TABLE \`${t}\` ADD COLUMN \`${f.name}\` ${sqlType[f.type]}`);
  }
  for (const [t, rows] of Object.entries(seed)) {
    const [[{ n }]] = await pool.query(`SELECT COUNT(*) n FROM \`${t}\``);
    if (!n) for (const r of rows) await insertRow(t, prepare(modules[t], r).values);
  }
}

// ---------- helpers ----------
function prepare(m, body) {
  for (const f of m.fields) {
    const v = body[f.name];
    if (f.req && (v === undefined || v === null || v === '')) return { error: `${f.label} is required` };
  }
  return { values: m.fields.map((f) => { const v = body[f.name]; return v === '' || v == null ? (isNum(f) ? 0 : null) : v; }) };
}
async function insertRow(t, values) {
  const m = modules[t];
  const [r] = await pool.query(
    `INSERT INTO \`${t}\` (${m.fields.map((f) => '`' + f.name + '`').join(',')}) VALUES (${m.fields.map(() => '?').join(',')})`, values);
  return r.insertId;
}
// stock adjustments change product stock
async function stock(row, sign) {
  if (!row || !row.product_id) return;
  const q = Number(row.qty || 0) * sign * (row.type === 'subtract' ? -1 : 1);
  await pool.query('UPDATE products SET stock = stock + ? WHERE id = ?', [q, row.product_id]);
}
function listSql(t, m) {
  const sel = ['t.*'], joins = [];
  for (const f of m.fields.filter((x) => x.type === 'ref')) {
    const a = 'j_' + f.name;
    joins.push(`LEFT JOIN \`${f.ref}\` ${a} ON ${a}.id = t.\`${f.name}\``);
    sel.push(`${a}.name AS \`${f.name}__name\``);
  }
  (m.extra || []).forEach((e) => sel.push(e));
  return `SELECT ${sel.join(',')} FROM \`${t}\` t ${joins.join(' ')}`;
}

// ---------- CRUD routes for every module ----------
for (const [t, m] of Object.entries(modules)) {
  const r = express.Router();
  const searchCols = m.fields.filter((f) => f.type === 'text' || f.type === 'textarea');

  r.get('/', wrap(async (req, res) => {
    const k = `%${req.query.q || ''}%`;
    const where = req.query.q && searchCols.length ? 'WHERE ' + searchCols.map((f) => `t.\`${f.name}\` LIKE ?`).join(' OR ') : '';
    const [rows] = await pool.query(`${listSql(t, m)} ${where} ORDER BY t.id DESC`, where ? searchCols.map(() => k) : []);
    res.json(rows);
  }));

  r.post('/', wrap(async (req, res) => {
    const p = prepare(m, req.body);
    if (p.error) return res.status(400).json({ error: p.error });
    const id = await insertRow(t, p.values);
    if (t === 'adjustments') await stock(req.body, 1);
    res.json({ id });
  }));

  r.put('/:id', wrap(async (req, res) => {
    const p = prepare(m, req.body);
    if (p.error) return res.status(400).json({ error: p.error });
    if (t === 'adjustments') {
      const [[old]] = await pool.query('SELECT * FROM adjustments WHERE id=?', [req.params.id]);
      await stock(old, -1);
      await stock(req.body, 1);
    }
    await pool.query(`UPDATE \`${t}\` SET ${m.fields.map((f) => '`' + f.name + '`=?').join(',')} WHERE id=?`, [...p.values, req.params.id]);
    res.json({ ok: true });
  }));

  r.delete('/:id', wrap(async (req, res) => {
    if (t === 'adjustments') {
      const [[old]] = await pool.query('SELECT * FROM adjustments WHERE id=?', [req.params.id]);
      await stock(old, -1);
    }
    await pool.query(`DELETE FROM \`${t}\` WHERE id=?`, [req.params.id]);
    res.json({ ok: true });
  }));

  app.use('/api/' + t, r);
}

// ---------- meta + dashboard ----------
app.get('/api/meta', (req, res) => {
  const out = {};
  for (const [t, m] of Object.entries(modules)) out[t] = { label: m.label, fields: m.fields, extraCols: m.extraCols || [] };
  res.json({ currency, groups, modules: out });
});

app.get('/api/dashboard', wrap(async (req, res) => {
  const one = async (sql) => (await pool.query(sql))[0][0].v;
  const sum = (t, col = 'total') => one(`SELECT COALESCE(SUM(${col}),0) v FROM ${t}`);
  const [sales, purchases, salesReturn, purchasesReturn, expenses, deposits] = await Promise.all([
    sum('sales'), sum('purchases'), sum('sales_returns'), sum('purchase_returns'), sum('expenses', 'amount'), sum('deposits', 'amount'),
  ]);
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d.toLocaleDateString('en-CA')); }
  const grouped = async (t) => {
    const [rows] = await pool.query(`SELECT date d, SUM(total) v FROM ${t} WHERE date >= ? GROUP BY date`, [days[0]]);
    return Object.fromEntries(rows.map((x) => [x.d, x.v]));
  };
  const [s, p] = await Promise.all([grouped('sales'), grouped('purchases')]);
  const [lowStock] = await pool.query('SELECT name, stock FROM products ORDER BY stock ASC LIMIT 5');
  res.json({
    sales, purchases, salesReturn, purchasesReturn, expenses, deposits,
    profit: sales - purchases - expenses + deposits,
    week: days.map((d) => ({ day: d, sales: s[d] || 0, purchases: p[d] || 0 })),
    lowStock,
  });
}));

const port = process.env.PORT || 3000;
setup()
  .then(() => app.listen(port, () => console.log(`Running on http://localhost:${port}`)))
  .catch((e) => {
    console.error('\nCould not start. Is MySQL running in XAMPP? Is DB_PASS in .env correct?\n');
    console.error(e.message);
    process.exit(1);
  });
