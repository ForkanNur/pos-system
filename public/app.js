let meta, cur, rows = [], editId = null;
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = (n) => `${meta.currency} ${Number(n || 0).toFixed(2)}`;

async function api(method, url, body) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Request failed');
  return d;
}

// ---------- sidebar ----------
function buildSide() {
  const key = location.hash.slice(2) || 'dashboard';
  $('#side').innerHTML = '<div class="brand">POS System</div>' + meta.groups.map((g) => {
    if (g.items[0] === 'dashboard') return `<a class="single ${key === 'dashboard' ? 'on' : ''}" href="#/dashboard">${g.icon} Dashboard</a>`;
    const open = g.items.includes(key) ? 'open' : '';
    return `<details ${open}><summary>${g.icon} ${g.label}</summary>` +
      g.items.map((i) => `<a class="${i === key ? 'on' : ''}" href="#/${i}">${meta.modules[i].label}</a>`).join('') + '</details>';
  }).join('');
}

// ---------- dashboard ----------
async function showDashboard() {
  const d = await api('GET', '/api/dashboard');
  const max = Math.max(1, ...d.week.flatMap((w) => [w.sales, w.purchases]));
  const stat = (l, v) => `<div class="stat"><small>${l}</small><b>${money(v)}</b></div>`;
  $('#view').innerHTML = `<h2>Dashboard</h2>
    <div class="cards">${stat('Sales', d.sales)}${stat('Purchases', d.purchases)}${stat('Sales Return', d.salesReturn)}${stat('Purchases Return', d.purchasesReturn)}${stat('Expenses', d.expenses)}${stat('Deposits', d.deposits)}${stat('Profit (Sales - Purchases - Expenses + Deposits)', d.profit)}</div>
    <div class="grid2"><div class="panel"><b>This Week Sales &amp; Purchases</b> <span class="legend">(dark = sales, light = purchases)</span>
      <div class="chart">${d.week.map((w) => `<div class="day"><div class="bars"><i style="height:${(w.sales / max) * 100}%" title="Sales ${w.sales}"></i><i class="p" style="height:${(w.purchases / max) * 100}%" title="Purchases ${w.purchases}"></i></div>${w.day.slice(5)}</div>`).join('')}</div></div>
      <div class="panel"><b>Lowest Stock</b><table>${d.lowStock.map((p) => `<tr><td>${esc(p.name)}</td><td>${p.stock}</td></tr>`).join('') || '<tr><td>No products yet</td></tr>'}</table></div></div>`;
}

// ---------- module list ----------
function cell(f, r) {
  if (f.type === 'ref') return esc(r[f.name + '__name']);
  if (f.type === 'number') return Number(r[f.name] || 0).toFixed(2);
  return esc(r[f.name]);
}
async function showModule(key) {
  cur = key;
  $('#view').innerHTML = `<h2>${esc(meta.modules[key].label)}</h2>
    <div class="toolbar"><input id="search" placeholder="Search...">
      <button class="green" onclick="exportCsv()">Excel (CSV)</button>
      <button onclick="window.print()">PDF / Print</button>
      <button class="primary" onclick="openForm()">+ Create</button></div>
    <div class="card"><table><thead id="head"></thead><tbody id="body"></tbody></table></div>`;
  $('#search').oninput = loadRows;
  await loadRows();
}
async function loadRows() {
  const m = meta.modules[cur];
  rows = await api('GET', `/api/${cur}?q=${encodeURIComponent($('#search').value)}`);
  const fields = m.fields.filter((f) => f.type !== 'textarea');
  $('#head').innerHTML = '<tr>' + fields.map((f) => `<th>${esc(f.label)}</th>`).join('') + m.extraCols.map((c) => `<th>${esc(c.label)}</th>`).join('') + '<th class="act">Action</th></tr>';
  $('#body').innerHTML = rows.length
    ? rows.map((r) => '<tr>' + fields.map((f) => `<td>${cell(f, r)}</td>`).join('') +
        m.extraCols.map((c) => `<td>${Number(r[c.key] || 0).toFixed(2)}</td>`).join('') +
        `<td class="act"><button onclick="openForm(${r.id})">Edit</button> <button class="del" onclick="removeRow(${r.id})">Delete</button></td></tr>`).join('')
    : `<tr><td colspan="${fields.length + m.extraCols.length + 1}">No records found</td></tr>`;
}
function exportCsv() {
  const m = meta.modules[cur];
  const fields = m.fields.filter((f) => f.type !== 'textarea');
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [[...fields.map((f) => f.label), ...m.extraCols.map((c) => c.label)].map(q).join(',')];
  rows.forEach((r) => lines.push([...fields.map((f) => (f.type === 'ref' ? r[f.name + '__name'] : r[f.name])), ...m.extraCols.map((c) => r[c.key])].map(q).join(',')));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv' }));
  a.download = cur + '.csv';
  a.click();
}

// ---------- create / edit / delete ----------
async function openForm(id) {
  const m = meta.modules[cur];
  editId = id || null;
  const rec = id ? rows.find((r) => r.id === id) : {};
  const refData = {};
  for (const f of m.fields.filter((x) => x.type === 'ref')) refData[f.name] = await api('GET', '/api/' + f.ref);
  const today = new Date().toLocaleDateString('en-CA');
  $('#mtitle').textContent = (id ? 'Edit ' : 'Create ') + m.label;
  $('#fields').innerHTML = m.fields.map((f) => {
    const v = rec[f.name] ?? (f.type === 'date' && f.name === 'date' ? today : '');
    const label = `<label>${esc(f.label)}${f.req ? ' *' : ''}</label>`;
    if (f.type === 'ref')
      return label + `<select name="${f.name}"><option value="">-- select --</option>${refData[f.name].map((o) => `<option value="${o.id}" ${o.id == v ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select>`;
    if (f.type === 'select')
      return label + `<select name="${f.name}">${f.req ? '' : '<option value=""></option>'}${f.options.map((o) => `<option ${o === v ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
    if (f.type === 'textarea') return label + `<textarea name="${f.name}" rows="3">${esc(v)}</textarea>`;
    const t = f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text';
    return label + `<input type="${t}" ${t === 'number' ? 'step="0.01"' : ''} name="${f.name}" value="${esc(v)}">`;
  }).join('');
  $('#err').textContent = '';
  $('#modal').classList.remove('hidden');
}
async function removeRow(id) {
  if (!confirm('Delete this record?')) return;
  await api('DELETE', `/api/${cur}/${id}`);
  loadRows();
}
$('#form').onsubmit = async (e) => {
  e.preventDefault();
  try {
    await api(editId ? 'PUT' : 'POST', `/api/${cur}${editId ? '/' + editId : ''}`, Object.fromEntries(new FormData(e.target)));
    $('#modal').classList.add('hidden');
    loadRows();
  } catch (err) { $('#err').textContent = err.message; }
};
$('#cancel').onclick = () => $('#modal').classList.add('hidden');

// ---------- router ----------
async function route() {
  const key = location.hash.slice(2) || 'dashboard';
  buildSide();
  if (key === 'dashboard') return showDashboard();
  if (meta.modules[key]) return showModule(key);
  $('#view').innerHTML = '<h2>Page not found</h2>';
}
window.onhashchange = route;
api('GET', '/api/meta').then((m) => { meta = m; route(); });
