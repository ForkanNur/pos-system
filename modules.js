// ALL modules are defined here. Tables and columns are created automatically from this file.
// To add a new module: copy one block, change the names, save, restart (npm start).
const F = (name, label, type = 'text', o = {}) => ({ name, label, type, ...o });
const R = (name, label, ref, o = {}) => F(name, label, 'ref', { ref, ...o });
const NAME = F('name', 'Name', 'text', { req: true });
const NOTE = F('note', 'Note', 'textarea');
const DATE = F('date', 'Date', 'date', { req: true });
const STATUS = (opts) => F('status', 'Status', 'select', { options: opts });
const DUE = { extra: ['(t.total - t.paid) AS due'], extraCols: [{ key: 'due', label: 'Due' }] };

const currency = 'Qrs';

const groups = [
  { label: 'Dashboard', icon: '📊', items: ['dashboard'] },
  { label: 'Products', icon: '📦', items: ['products', 'categories'] },
  { label: 'Adjustment', icon: '🛠', items: ['adjustments'] },
  { label: 'Quotations', icon: '🧾', items: ['quotations'] },
  { label: 'Purchases', icon: '🛒', items: ['purchases'] },
  { label: 'Sales', icon: '💰', items: ['sales'] },
  { label: 'Sales Return', icon: '↪️', items: ['sales_returns'] },
  { label: 'Purchases Return', icon: '↩️', items: ['purchase_returns'] },
  { label: 'HRM', icon: '🏛', items: ['employees', 'departments', 'attendance'] },
  { label: 'Transfer', icon: '🔁', items: ['transfers'] },
  { label: 'Accounting', icon: '👛', items: ['accounts', 'money_transfers', 'expenses', 'expense_categories', 'deposits', 'deposit_categories'] },
  { label: 'People', icon: '👥', items: ['customers', 'suppliers', 'users'] },
  { label: 'Projects', icon: '🗂', items: ['projects'] },
  { label: 'Tasks', icon: '✅', items: ['tasks'] },
  { label: 'Settings', icon: '⚙️', items: ['warehouses'] },
];

const modules = {
  // ---------- Products ----------
  categories: { label: 'Categories', fields: [NAME] },
  products: { label: 'Products', fields: [
    F('code', 'Code'), NAME, R('category_id', 'Category', 'categories'),
    F('cost', 'Cost', 'number'), F('price', 'Price', 'number'), F('stock', 'Stock', 'number'), F('unit', 'Unit'),
  ] },
  adjustments: { label: 'Stock Adjustment', fields: [
    R('product_id', 'Product', 'products', { req: true }),
    F('type', 'Type', 'select', { options: ['add', 'subtract'], req: true }),
    F('qty', 'Quantity', 'number', { req: true }), DATE, NOTE,
  ] },

  // ---------- Sales / Purchases ----------
  quotations: { label: 'Quotations', fields: [
    F('reference', 'Reference'), R('customer_id', 'Customer', 'customers'), DATE,
    F('total', 'Total', 'number'), STATUS(['pending', 'sent', 'accepted', 'rejected']), NOTE,
  ] },
  sales: { label: 'Sales', ...DUE, fields: [
    F('reference', 'Reference'), R('customer_id', 'Customer', 'customers'), DATE,
    F('total', 'Total', 'number', { req: true }), F('paid', 'Paid', 'number'), STATUS(['completed', 'pending']), NOTE,
  ] },
  sales_returns: { label: 'Sales Return', fields: [
    F('reference', 'Reference'), R('customer_id', 'Customer', 'customers'), DATE, F('total', 'Total', 'number', { req: true }), NOTE,
  ] },
  purchases: { label: 'Purchases', ...DUE, fields: [
    F('reference', 'Reference'), R('supplier_id', 'Supplier', 'suppliers'), DATE,
    F('total', 'Total', 'number', { req: true }), F('paid', 'Paid', 'number'), STATUS(['received', 'pending']), NOTE,
  ] },
  purchase_returns: { label: 'Purchases Return', fields: [
    F('reference', 'Reference'), R('supplier_id', 'Supplier', 'suppliers'), DATE, F('total', 'Total', 'number', { req: true }), NOTE,
  ] },

  // ---------- HRM ----------
  departments: { label: 'Departments', fields: [NAME] },
  employees: { label: 'Employees', fields: [
    NAME, R('department_id', 'Department', 'departments'), F('designation', 'Designation'),
    F('phone', 'Phone'), F('email', 'Email'), F('salary', 'Salary', 'number'), F('join_date', 'Join Date', 'date'),
  ] },
  attendance: { label: 'Attendance', fields: [
    R('employee_id', 'Employee', 'employees', { req: true }), DATE,
    F('status', 'Status', 'select', { options: ['present', 'absent', 'leave'], req: true }),
  ] },

  // ---------- Transfer ----------
  transfers: { label: 'Stock Transfer', fields: [
    R('from_wh', 'From Warehouse', 'warehouses', { req: true }), R('to_wh', 'To Warehouse', 'warehouses', { req: true }),
    R('product_id', 'Product', 'products'), F('qty', 'Quantity', 'number'), DATE, NOTE,
  ] },

  // ---------- Accounting ----------
  accounts: { label: 'Accounts', fields: [NAME, F('number', 'Account No.'), F('initial_balance', 'Initial Balance', 'number')],
    extraCols: [{ key: 'balance', label: 'Balance' }],
    extra: [`(t.initial_balance
      + (SELECT COALESCE(SUM(amount),0) FROM deposits WHERE account_id=t.id)
      - (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE account_id=t.id)
      + (SELECT COALESCE(SUM(amount),0) FROM money_transfers WHERE to_account=t.id)
      - (SELECT COALESCE(SUM(amount),0) FROM money_transfers WHERE from_account=t.id)) AS balance`] },
  money_transfers: { label: 'Transfer Money', fields: [
    R('from_account', 'From Account', 'accounts', { req: true }), R('to_account', 'To Account', 'accounts', { req: true }),
    DATE, F('amount', 'Amount', 'number', { req: true }), NOTE,
  ] },
  expense_categories: { label: 'Expense Category', fields: [NAME] },
  expenses: { label: 'Expenses', fields: [
    R('account_id', 'Account', 'accounts', { req: true }), R('category_id', 'Category', 'expense_categories'),
    DATE, F('amount', 'Amount', 'number', { req: true }), NOTE,
  ] },
  deposit_categories: { label: 'Deposit Category', fields: [NAME] },
  deposits: { label: 'Deposits', fields: [
    R('account_id', 'Account', 'accounts', { req: true }), R('category_id', 'Category', 'deposit_categories'),
    DATE, F('amount', 'Amount', 'number', { req: true }), NOTE,
  ] },

  // ---------- People ----------
  customers: { label: 'Customers', extraCols: [{ key: 'sale_due', label: 'Total Sale Due' }],
    extra: ['(SELECT COALESCE(SUM(total-paid),0) FROM sales WHERE customer_id=t.id) AS sale_due'],
    fields: [NAME, F('phone', 'Phone'), F('email', 'Email'), F('tax_number', 'Tax Number'), F('city', 'City'), F('address', 'Address')] },
  suppliers: { label: 'Suppliers', extraCols: [{ key: 'purchase_due', label: 'Total Purchase Due' }],
    extra: ['(SELECT COALESCE(SUM(total-paid),0) FROM purchases WHERE supplier_id=t.id) AS purchase_due'],
    fields: [NAME, F('phone', 'Phone'), F('email', 'Email'), F('tax_number', 'Tax Number'), F('city', 'City'), F('address', 'Address')] },
  users: { label: 'Users', fields: [NAME, F('email', 'Email'), F('phone', 'Phone'), F('role', 'Role', 'select', { options: ['admin', 'manager', 'staff'] })] },

  // ---------- Projects / Tasks / Settings ----------
  projects: { label: 'Projects', fields: [
    NAME, R('customer_id', 'Customer', 'customers'), F('start_date', 'Start', 'date'), F('end_date', 'End', 'date'),
    F('budget', 'Budget', 'number'), STATUS(['planned', 'running', 'done']),
  ] },
  tasks: { label: 'Tasks', fields: [
    F('title', 'Title', 'text', { req: true }), R('project_id', 'Project', 'projects'), R('employee_id', 'Assigned To', 'employees'),
    F('due_date', 'Due Date', 'date'), STATUS(['todo', 'doing', 'done']), F('priority', 'Priority', 'select', { options: ['low', 'medium', 'high'] }),
  ] },
  warehouses: { label: 'Warehouses', fields: [NAME, F('city', 'City')] },
};

// Sample rows added the first time (only if the table is empty)
const seed = {
  customers: [{ name: 'Walk-in Customer', phone: '00000' }],
  suppliers: [{ name: 'Sample Supplier' }],
  users: [{ name: 'Admin', email: 'admin@example.com', role: 'admin' }],
  warehouses: [{ name: 'Main Warehouse' }],
  accounts: [{ name: 'Cash', number: '0001', initial_balance: 0 }],
  expense_categories: [{ name: 'Rent' }, { name: 'Salary' }, { name: 'Utilities' }],
  deposit_categories: [{ name: 'Capital' }, { name: 'Other Income' }],
  categories: [{ name: 'General' }],
  departments: [{ name: 'Sales' }],
};

module.exports = { currency, groups, modules, seed };
