import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bar, Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend,
} from 'chart.js'
import {
  ArrowDownLeft, ArrowUpRight, IndianRupee, Bell, CalendarDays, Check, ChevronDown,
  CircleHelp, CreditCard, LayoutDashboard, LogOut, Menu, Plus, Search, Settings2,
  ShoppingBag, SlidersHorizontal, Trash2, TrendingDown, TrendingUp, Wallet, X, Pencil,
} from 'lucide-react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { api, money } from './services/api'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend)
const CATEGORIES = ['Food', 'Travel', 'Shopping', 'Bills', 'Education', 'Entertainment', 'Healthcare', 'Others']
const COLORS = ['#6478e8', '#42b8a5', '#ffb84d', '#fb7c74', '#a88bea', '#50a5db', '#ef8db8', '#9aa6b7']
const today = new Date().toISOString().slice(0, 10)

function App() {
  return <AuthProvider><Tracker /></AuthProvider>
}

function Tracker() {
  const { token, user, logout, login, register } = useAuth()
  const [page, setPage] = useState('Overview')
  const [mobileMenu, setMobileMenu] = useState(false)
  const [data, setData] = useState({ summary: null, categories: [], monthly: [], transactions: [], budget: null })
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState(null)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [filters, setFilters] = useState({ search: '', category: '', type: '', start_date: '', end_date: '', sort_by: 'date', order: 'desc' })
  const [budgetValue, setBudgetValue] = useState('')
  const [budgetBusy, setBudgetBusy] = useState(false)
  const [authMode, setAuthMode] = useState('login')
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState('')

  const notify = useCallback((message, kind = 'success') => {
    setNotice({ message, kind })
    window.setTimeout(() => setNotice(null), 3500)
  }, [])

  const loadData = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      Object.entries(filters).forEach(([key, value]) => value && params.set(key, value))
      const [summary, categories, monthly, transactions, budget] = await Promise.all([
        api('/dashboard/summary', { token }),
        api('/dashboard/category-summary', { token }),
        api('/dashboard/monthly-summary', { token }),
        api(`/transactions?${params.toString()}`, { token }),
        api('/budgets', { token }),
      ])
      setData({ summary, categories, monthly, transactions, budget })
      setBudgetValue(budget?.amount ?? '')
    } catch (error) {
      notify(error.message, 'error')
    } finally { setLoading(false) }
  }, [token, filters, notify])

  useEffect(() => { loadData() }, [loadData])
  const recent = data.summary?.recent_transactions || []
  const chartMonthly = useMemo(() => ({
    labels: data.monthly.map((item) => new Date(2000, item.month - 1).toLocaleString('en', { month: 'short' })),
    datasets: [
      { label: 'Income', data: data.monthly.map((item) => Number(item.income)), backgroundColor: '#42b8a5', borderRadius: 5, maxBarThickness: 15 },
      { label: 'Expenses', data: data.monthly.map((item) => Number(item.expenses)), backgroundColor: '#7183ed', borderRadius: 5, maxBarThickness: 15 },
    ],
  }), [data.monthly])
  const chartCategory = useMemo(() => ({
    labels: data.categories.map((item) => item.category),
    datasets: [{ data: data.categories.map((item) => Number(item.total)), backgroundColor: data.categories.map((_, i) => COLORS[i % COLORS.length]), borderWidth: 0, hoverOffset: 4 }],
  }), [data.categories])

  async function submitTransaction(payload) {
    try {
      await api(editing ? `/transactions/${editing.id}` : '/transactions', {
        token, method: editing ? 'PUT' : 'POST', body: JSON.stringify(payload),
      })
      setModal(false); setEditing(null); await loadData()
      notify(editing ? 'Transaction updated' : 'Transaction added')
    } catch (error) {
      notify(error.message, 'error')
      throw error
    }
  }

  async function deleteTransaction(item) {
    if (!window.confirm(`Delete "${item.title}"? This cannot be undone.`)) return
    try {
      await api(`/transactions/${item.id}`, { token, method: 'DELETE' })
      await loadData(); notify('Transaction deleted')
    } catch (error) { notify(error.message, 'error') }
  }

  async function saveBudget(event) {
    event.preventDefault()
    setBudgetBusy(true)
    try {
      await api('/budgets', {
        token, method: 'POST',
        body: JSON.stringify({ amount: Number(budgetValue), year: new Date().getFullYear(), month: new Date().getMonth() + 1 }),
      })
      await loadData(); notify('Monthly budget saved')
    } catch (error) { notify(error.message, 'error') } finally { setBudgetBusy(false) }
  }

  async function submitAuth(event) {
    event.preventDefault(); setAuthBusy(true); setAuthError('')
    const form = new FormData(event.currentTarget)
    const values = { email: form.get('email'), password: form.get('password') }
    if (authMode === 'register') values.name = form.get('name')
    try {
      await (authMode === 'login' ? login(values) : register(values))
    } catch (error) { setAuthError(error.message) } finally { setAuthBusy(false) }
  }

  if (!token || !user) return <AuthScreen mode={authMode} setMode={setAuthMode} busy={authBusy} error={authError} onSubmit={submitAuth} />
  const sideItems = [
    { label: 'Overview', icon: LayoutDashboard },
    { label: 'Transactions', icon: CreditCard },
    { label: 'Budgets', icon: IndianRupee },
  ]

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-800">
      {notice && <div className={`fixed right-5 top-5 z-[70] flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg ${notice.kind === 'error' ? 'bg-rose-600' : 'bg-slate-900'}`}><Check size={16} />{notice.message}</div>}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-slate-100 bg-white px-5 py-6 transition-transform lg:translate-x-0 ${mobileMenu ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="mb-10 flex items-center justify-between px-1">
          <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 text-white"><Wallet size={21} /></div><div><div className="heading-font text-[15px] font-extrabold tracking-tight">moneta</div><div className="text-[10px] font-semibold uppercase tracking-[.16em] text-slate-400">personal finance</div></div></div>
          <button className="lg:hidden" onClick={() => setMobileMenu(false)} aria-label="Close menu"><X size={20} /></button>
        </div>
        <div className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.15em] text-slate-400">Workspace</div>
        <nav className="space-y-1">
          {sideItems.map(({ label, icon: Icon }) => <button key={label} onClick={() => { setPage(label); setMobileMenu(false) }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[13px] font-semibold transition ${page === label ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}><Icon size={18} strokeWidth={2} />{label}{label === 'Transactions' && <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px]">{data.transactions.length}</span>}</button>)}
        </nav>
        <div className="mb-3 mt-9 px-3 text-[10px] font-bold uppercase tracking-[.15em] text-slate-400">Support</div>
        <button className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-[13px] font-semibold text-slate-500 hover:bg-slate-50"><CircleHelp size={18} />Help center</button>
        <div className="mt-auto rounded-2xl bg-[#f6f7fb] p-4">
          <div className="mb-3 grid h-9 w-9 place-items-center rounded-xl bg-white text-indigo-600"><Settings2 size={18} /></div>
          <p className="text-xs font-bold">Your finances, in focus.</p><p className="mt-1 text-[11px] leading-5 text-slate-500">A little clarity goes a long way.</p>
        </div>
        <button onClick={logout} className="mt-4 flex items-center gap-3 rounded-xl px-3 py-3 text-left text-[13px] font-semibold text-slate-500 hover:bg-rose-50 hover:text-rose-600"><LogOut size={18} />Sign out</button>
      </aside>
      {mobileMenu && <button className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden" onClick={() => setMobileMenu(false)} aria-label="Close navigation" />}

      <main className="min-h-screen lg:ml-[248px]">
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-slate-100 bg-white/90 px-5 backdrop-blur md:px-9">
          <div className="flex items-center gap-3"><button className="rounded-lg p-2 hover:bg-slate-100 lg:hidden" onClick={() => setMobileMenu(true)} aria-label="Open menu"><Menu size={20} /></button><div><p className="heading-font text-[16px] font-extrabold">{page === 'Overview' ? 'Overview' : page}</p><p className="hidden text-[11px] text-slate-400 sm:block">Good to see you, {user.name.split(' ')[0]}</p></div></div>
          <div className="flex items-center gap-2 sm:gap-4"><div className="hidden items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500 sm:flex"><CalendarDays size={14} />{new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div><button className="relative rounded-xl p-2.5 text-slate-500 hover:bg-slate-50" aria-label="Notifications"><Bell size={18} /><span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-rose-400" /></button><div className="grid h-9 w-9 place-items-center rounded-full bg-[#e9edff] text-xs font-bold uppercase text-indigo-700">{user.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</div></div>
        </header>
        <div className="mx-auto max-w-[1440px] px-5 py-7 md:px-9 md:py-9">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div><h1 className="heading-font text-[24px] font-extrabold tracking-tight text-slate-900 md:text-[28px]">{page === 'Overview' ? 'Financial overview' : page}</h1><p className="mt-1 text-[13px] text-slate-500">{page === 'Overview' ? 'Here’s what’s happening with your money.' : page === 'Transactions' ? 'Track and manage your income and expenses.' : 'Set a monthly spending target and stay on track.'}</p></div>
            <button onClick={() => { setEditing(null); setModal(true) }} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-indigo-200 hover:bg-indigo-700"><Plus size={16} />Add transaction</button>
          </div>
          {loading && !data.summary ? <div className="grid min-h-[50vh] place-items-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-100 border-t-indigo-600" /></div> : page === 'Transactions' ? (
            <TransactionsPage data={data.transactions} filters={filters} setFilters={setFilters} onEdit={(item) => { setEditing(item); setModal(true) }} onDelete={deleteTransaction} loading={loading} />
          ) : page === 'Budgets' ? (
            <BudgetPage data={data} budgetValue={budgetValue} setBudgetValue={setBudgetValue} saveBudget={saveBudget} budgetBusy={budgetBusy} />
          ) : (
            <Dashboard data={data} recent={recent} chartMonthly={chartMonthly} chartCategory={chartCategory} onAdd={() => { setEditing(null); setModal(true) }} goTransactions={() => setPage('Transactions')} />
          )}
        </div>
      </main>
      {modal && <TransactionModal initial={editing} onClose={() => { setModal(false); setEditing(null) }} onSubmit={submitTransaction} />}
    </div>
  )
}

function Dashboard({ data, recent, chartMonthly, chartCategory, onAdd, goTransactions }) {
  const summary = data.summary || {}
  const cards = [
    { label: 'Total income', value: summary.total_income, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50', note: 'All-time income' },
    { label: 'Total expenses', value: summary.total_expenses, icon: TrendingDown, color: 'text-rose-500', bg: 'bg-rose-50', note: 'All-time spending' },
    { label: 'Current balance', value: summary.balance, icon: Wallet, color: 'text-indigo-600', bg: 'bg-indigo-50', note: 'Income minus expenses' },
    { label: 'This month', value: summary.monthly_expenses, icon: CalendarDays, color: 'text-amber-600', bg: 'bg-amber-50', note: 'Expenses this month' },
  ]
  return <>
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(({ label, value, icon: Icon, color, bg, note }) => <div key={label} className="card-shadow rounded-2xl border border-slate-100 bg-white p-5"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold text-slate-500">{label}</p><p className="heading-font mt-3 text-[24px] font-extrabold tracking-tight text-slate-900">{money(value)}</p></div><div className={`grid h-10 w-10 place-items-center rounded-xl ${bg} ${color}`}><Icon size={19} /></div></div><p className="mt-3 text-[10px] text-slate-400">{note}</p></div>)}
    </section>
    {summary.budget_exceeded && <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">You’ve exceeded this month’s budget by {money(Number(summary.monthly_expenses) - Number(summary.monthly_budget))}.</div>}
    <section className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[1.7fr_1fr]">
      <div className="card-shadow rounded-2xl border border-slate-100 bg-white p-5 md:p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="heading-font text-sm font-extrabold">Cash flow</h2><p className="mt-1 text-[11px] text-slate-400">Income and expenses by month · {new Date().getFullYear()}</p></div><span className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[10px] font-semibold text-slate-500">This year <ChevronDown size={12} className="ml-1 inline" /></span></div><div className="h-[245px]">{data.monthly.length && <Bar data={chartMonthly} options={{ maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 7, boxHeight: 7, padding: 18, font: { size: 10 } } } }, scales: { x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } }, y: { grid: { color: '#f1f3f7' }, ticks: { color: '#94a3b8', font: { size: 10 }, callback: (v) => money(v) }, border: { display: false } } } }} />}</div></div>
      <div className="card-shadow rounded-2xl border border-slate-100 bg-white p-5 md:p-6"><div className="mb-3"><h2 className="heading-font text-sm font-extrabold">Spending by category</h2><p className="mt-1 text-[11px] text-slate-400">Where your money goes</p></div>{data.categories.length ? <><div className="mx-auto h-[160px] max-w-[200px]"><Doughnut data={chartCategory} options={{ maintainAspectRatio: false, cutout: '72%', plugins: { legend: { display: false } } }} /></div><div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2">{data.categories.slice(0, 6).map((item, i) => <div key={item.category} className="flex items-center justify-between gap-2 text-[10px]"><span className="flex items-center gap-1.5 text-slate-500"><i className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />{item.category}</span><b className="text-slate-700">{money(item.total)}</b></div>)}</div></> : <EmptyState title="No spending yet" detail="Add an expense to see your breakdown." compact />}</div>
    </section>
    <section className="card-shadow mt-5 rounded-2xl border border-slate-100 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 md:px-6"><div><h2 className="heading-font text-sm font-extrabold">Recent transactions</h2><p className="mt-1 text-[11px] text-slate-400">Your latest money moves</p></div><button onClick={goTransactions} className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800">View all <ArrowUpRight size={13} className="ml-1 inline" /></button></div>
      {recent.length ? <div className="divide-y divide-slate-50">{recent.map((item) => <TransactionRow key={item.id} item={item} compact />)}</div> : <EmptyState title="No transactions yet" detail="Add your first income or expense to get started." action={onAdd} />}
    </section>
  </>
}

function TransactionsPage({ data, filters, setFilters, onEdit, onDelete, loading }) {
  function update(key, value) { setFilters((current) => ({ ...current, [key]: value })) }
  return <section className="card-shadow overflow-hidden rounded-2xl border border-slate-100 bg-white">
    <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:p-5"><div className="flex items-center gap-2 text-sm font-bold"><SlidersHorizontal size={16} className="text-indigo-600" />Filter transactions</div><div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-6">
      <div className="relative sm:col-span-2 xl:col-span-2"><Search size={15} className="absolute left-3 top-3 text-slate-400" /><input value={filters.search} onChange={(e) => update('search', e.target.value)} className="input pl-9 text-xs" placeholder="Search title..." /></div>
      <select value={filters.category} onChange={(e) => update('category', e.target.value)} className="input text-xs"><option value="">All categories</option>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select>
      <select value={filters.type} onChange={(e) => update('type', e.target.value)} className="input text-xs"><option value="">All types</option><option value="income">Income</option><option value="expense">Expense</option></select>
      <input type="date" value={filters.start_date} onChange={(e) => update('start_date', e.target.value)} className="input text-xs" aria-label="Start date" />
      <input type="date" value={filters.end_date} onChange={(e) => update('end_date', e.target.value)} className="input text-xs" aria-label="End date" />
    </div><div className="flex flex-wrap items-center gap-2"><span className="text-[11px] text-slate-400">Sort by</span><select value={filters.sort_by} onChange={(e) => update('sort_by', e.target.value)} className="input w-auto py-2 text-xs"><option value="date">Date</option><option value="amount">Amount</option></select><select value={filters.order} onChange={(e) => update('order', e.target.value)} className="input w-auto py-2 text-xs"><option value="desc">Newest / highest</option><option value="asc">Oldest / lowest</option></select><span className="ml-auto text-[11px] text-slate-400">{data.length} result{data.length === 1 ? '' : 's'}</span></div></div>
    {loading ? <div className="p-12 text-center text-sm text-slate-400">Loading transactions…</div> : data.length ? <><div className="hidden grid-cols-[2fr_1fr_1fr_1fr_90px] gap-3 bg-slate-50/70 px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 md:grid"><span>Transaction</span><span>Category</span><span>Date</span><span className="text-right">Amount</span><span /></div><div className="divide-y divide-slate-50">{data.map((item) => <TransactionRow key={item.id} item={item} onEdit={onEdit} onDelete={onDelete} />)}</div></> : <EmptyState title="No transactions found" detail="Try changing your filters or add a new transaction." />}</section>
}

function TransactionRow({ item, onEdit, onDelete, compact = false }) {
  const Icon = item.type === 'income' ? ArrowDownLeft : ShoppingBag
  return <div className={`flex items-center gap-3 px-4 py-3.5 md:px-6 ${compact ? '' : 'md:grid md:grid-cols-[2fr_1fr_1fr_1fr_90px] md:gap-3'}`}>
    <div className="flex min-w-0 flex-1 items-center gap-3"><div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${item.type === 'income' ? 'bg-emerald-50 text-emerald-600' : 'bg-[#f0f2ff] text-indigo-600'}`}><Icon size={17} /></div><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-800">{item.title}</p><p className="mt-1 text-[10px] text-slate-400">{item.payment_method} · <span className="md:hidden">{item.category}</span></p></div></div>
    <span className="hidden text-xs text-slate-500 md:block">{item.category}</span><span className="hidden text-xs text-slate-500 md:block">{new Date(`${item.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
    <div className="ml-auto text-right md:ml-0"><p className={`text-xs font-bold ${item.type === 'income' ? 'text-emerald-600' : 'text-slate-800'}`}>{item.type === 'income' ? '+' : '−'}{money(item.amount)}</p><p className="mt-1 text-[10px] text-slate-400 md:hidden">{new Date(`${item.date}T00:00:00`).toLocaleDateString()}</p></div>
    {!compact && <div className="hidden justify-end gap-1 md:flex"><button onClick={() => onEdit(item)} className="rounded-lg p-2 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600" aria-label={`Edit ${item.title}`}><Pencil size={15} /></button><button onClick={() => onDelete(item)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Delete ${item.title}`}><Trash2 size={15} /></button></div>}
    {!compact && <div className="flex flex-col gap-1 md:hidden"><button onClick={() => onEdit(item)} aria-label={`Edit ${item.title}`}><Pencil size={14} /></button><button onClick={() => onDelete(item)} aria-label={`Delete ${item.title}`}><Trash2 size={14} /></button></div>}
  </div>
}

function BudgetPage({ data, budgetValue, setBudgetValue, saveBudget, budgetBusy }) {
  const summary = data.summary || {}
  const budget = Number(summary.monthly_budget || 0)
  const spent = Number(summary.monthly_expenses || 0)
  const percent = budget ? Math.min((spent / budget) * 100, 100) : 0
  return <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_1fr]">
    <section className="card-shadow rounded-2xl border border-slate-100 bg-white p-6 md:p-8"><div className="mb-6 grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-600"><IndianRupee size={23} /></div><h2 className="heading-font text-lg font-extrabold">Monthly spending budget</h2><p className="mt-2 max-w-md text-xs leading-5 text-slate-500">Choose a monthly spending limit. Your progress updates automatically as you record expenses.</p>
      <form onSubmit={saveBudget} className="mt-7"><label className="label" htmlFor="budget">Budget amount</label><div className="flex gap-2"><div className="relative flex-1"><span className="absolute left-3 top-[10px] text-sm text-slate-400">₹</span><input id="budget" required min="0.01" step="0.01" type="number" value={budgetValue} onChange={(e) => setBudgetValue(e.target.value)} className="input pl-8" placeholder="e.g. 2500.00" /></div><button disabled={budgetBusy} className="rounded-xl bg-indigo-600 px-5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-60">{budgetBusy ? 'Saving…' : 'Save budget'}</button></div></form>
      <div className="mt-8 rounded-xl bg-slate-50 p-4"><div className="mb-3 flex justify-between text-xs"><span className="font-semibold text-slate-600">Spent this month</span><span className="font-bold">{money(spent)} <span className="font-medium text-slate-400">/ {money(budget)}</span></span></div><div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full transition-all ${spent > budget && budget ? 'bg-rose-500' : 'bg-indigo-600'}`} style={{ width: `${percent}%` }} /></div><div className="mt-3 flex justify-between text-[11px]"><span className={spent > budget && budget ? 'font-semibold text-rose-600' : 'text-slate-400'}>{budget ? `${Math.round((spent / budget) * 100)}% used` : 'Set a budget to track progress'}</span><span className="font-semibold text-slate-600">{money(Math.max(budget - spent, 0))} remaining</span></div></div>
    </section>
    <section className={`card-shadow rounded-2xl border p-6 md:p-8 ${summary.budget_exceeded ? 'border-rose-100 bg-rose-50/40' : 'border-slate-100 bg-white'}`}><div className={`grid h-11 w-11 place-items-center rounded-xl ${summary.budget_exceeded ? 'bg-rose-100 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>{summary.budget_exceeded ? <TrendingDown size={20} /> : <Check size={20} />}</div><h2 className="heading-font mt-5 text-base font-extrabold">{summary.budget_exceeded ? 'Budget limit reached' : 'You’re on track'}</h2><p className="mt-2 text-xs leading-5 text-slate-500">{budget ? summary.budget_exceeded ? `You are ${money(spent - budget)} over your monthly budget. Consider reviewing your spending categories.` : `You have ${money(budget - spent)} left to spend this month.` : 'Add a monthly budget to see how your spending is tracking against your goal.'}</p><div className="mt-7 grid grid-cols-2 gap-3"><div className="rounded-xl bg-white p-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Monthly budget</p><p className="heading-font mt-2 text-lg font-extrabold">{money(budget)}</p></div><div className="rounded-xl bg-white p-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Spent so far</p><p className="heading-font mt-2 text-lg font-extrabold">{money(spent)}</p></div></div></section>
  </div>
}

function TransactionModal({ initial, onClose, onSubmit }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [type, setType] = useState(initial?.type || 'expense')
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    const form = new FormData(event.currentTarget)
    try {
      await onSubmit({
        title: form.get('title'), amount: Number(form.get('amount')),
        category: form.get('category'), type, date: form.get('date'),
        description: form.get('description'), payment_method: form.get('payment_method'),
      })
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/35 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
    <div className="my-auto w-full max-w-[520px] rounded-2xl bg-white p-5 shadow-2xl md:p-7"><div className="mb-5 flex items-start justify-between"><div><h2 className="heading-font text-lg font-extrabold">{initial ? 'Edit transaction' : 'Add transaction'}</h2><p className="mt-1 text-xs text-slate-400">Keep your finances up to date.</p></div><button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Close"><X size={18} /></button></div>
      <form onSubmit={submit} className="space-y-4"><div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1"><button type="button" onClick={() => setType('expense')} className={`rounded-lg py-2 text-xs font-bold ${type === 'expense' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>Expense</button><button type="button" onClick={() => setType('income')} className={`rounded-lg py-2 text-xs font-bold ${type === 'income' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>Income</button></div>
        <div><label className="label" htmlFor="title">Title</label><input id="title" name="title" required maxLength="120" defaultValue={initial?.title} className="input text-sm" placeholder="e.g. Weekly groceries" /></div>
        <div className="grid grid-cols-2 gap-3"><div><label className="label" htmlFor="amount">Amount</label><div className="relative"><span className="absolute left-3 top-2.5 text-sm text-slate-400">₹</span><input id="amount" name="amount" required type="number" min="0.01" step="0.01" defaultValue={initial?.amount} className="input pl-8 text-sm" placeholder="0.00" /></div></div><div><label className="label" htmlFor="date">Date</label><input id="date" name="date" required type="date" defaultValue={initial?.date || today} className="input text-sm" /></div></div>
        <div className="grid grid-cols-2 gap-3"><div><label className="label" htmlFor="category">Category</label><select id="category" name="category" defaultValue={initial?.category || 'Food'} className="input text-sm">{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></div><div><label className="label" htmlFor="payment">Payment method</label><select id="payment" name="payment_method" defaultValue={initial?.payment_method || 'Card'} className="input text-sm">{['Card', 'Cash', 'Bank transfer', 'Digital wallet', 'Other'].map((method) => <option key={method}>{method}</option>)}</select></div></div>
        <div><label className="label" htmlFor="description">Description <span className="font-normal text-slate-400">(optional)</span></label><textarea id="description" name="description" rows="2" maxLength="500" defaultValue={initial?.description} className="input resize-none text-sm" placeholder="Add a note..." /></div>
        {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button><button disabled={busy} className="rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-60">{busy ? 'Saving…' : initial ? 'Save changes' : 'Add transaction'}</button></div>
      </form>
    </div>
  </div>
}

function AuthScreen({ mode, setMode, busy, error, onSubmit }) {
  return <div className="flex min-h-screen bg-white"><div className="hidden w-[48%] flex-col justify-between bg-[#171c45] p-12 text-white lg:flex"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-500"><Wallet size={21} /></div><div className="heading-font font-extrabold">moneta</div></div><div className="max-w-lg"><div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[10px] font-semibold text-indigo-200"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> YOUR MONEY, MADE CLEAR</div><h1 className="heading-font text-[42px] font-extrabold leading-[1.18] tracking-tight">Make every rupee<br />make more sense.</h1><p className="mt-5 max-w-sm text-sm leading-6 text-indigo-100/70">A calmer, clearer way to keep track of spending, build good habits and feel in control of your finances.</p><div className="mt-10 flex gap-3"><div className="rounded-2xl border border-white/10 bg-white/5 p-4"><TrendingUp size={19} className="text-emerald-300" /><p className="mt-3 text-xs font-bold">Know your numbers</p><p className="mt-1 text-[10px] text-indigo-100/60">Income, spending and balance</p></div><div className="rounded-2xl border border-white/10 bg-white/5 p-4"><IndianRupee size={19} className="text-amber-300" /><p className="mt-3 text-xs font-bold">Stay on budget</p><p className="mt-1 text-[10px] text-indigo-100/60">Simple goals that stick</p></div></div></div><p className="text-[10px] text-indigo-100/40">© {new Date().getFullYear()} Moneta. Your personal finance workspace.</p></div>
    <div className="grid flex-1 place-items-center bg-[#f8f9fc] px-5 py-12"><div className="w-full max-w-[390px] rounded-2xl bg-white p-7 shadow-[0_12px_50px_rgba(20,30,70,.06)] md:p-9"><div className="mb-8 flex items-center gap-3 lg:hidden"><div className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-600 text-white"><Wallet size={19} /></div><span className="heading-font font-extrabold">moneta</span></div><p className="text-xs font-bold uppercase tracking-wider text-indigo-600">{mode === 'login' ? 'Welcome back' : 'Get started'}</p><h2 className="heading-font mt-2 text-[25px] font-extrabold tracking-tight">{mode === 'login' ? 'Sign in to your account' : 'Create your account'}</h2><p className="mt-2 text-xs leading-5 text-slate-500">{mode === 'login' ? 'Enter your details to access your dashboard.' : 'Start building a clearer picture of your finances.'}</p>
      <form onSubmit={onSubmit} className="mt-7 space-y-4">{mode === 'register' && <div><label className="label" htmlFor="name">Your name</label><input name="name" id="name" required maxLength="100" className="input text-sm" placeholder="Alex Morgan" /></div>}<div><label className="label" htmlFor="email">Email address</label><input name="email" id="email" required type="email" className="input text-sm" placeholder="you@example.com" /></div><div><label className="label" htmlFor="password">Password</label><input name="password" id="password" required minLength={mode === 'register' ? 8 : 1} type="password" className="input text-sm" placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'} /></div>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">{error}</p>}<button disabled={busy} className="mt-2 w-full rounded-xl bg-indigo-600 py-3 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-60">{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button></form>
      <p className="mt-6 text-center text-xs text-slate-500">{mode === 'login' ? 'New to Moneta?' : 'Already have an account?'} <button onClick={() => setMode(mode === 'login' ? 'register' : 'login')} className="font-bold text-indigo-600 hover:text-indigo-800">{mode === 'login' ? 'Create an account' : 'Sign in'}</button></p><p className="mt-7 text-center text-[10px] leading-5 text-slate-400">Your financial data is private and protected by account authentication.</p></div></div>
  </div>
}

function EmptyState({ title, detail, action, compact = false }) {
  return <div className={`flex flex-col items-center justify-center px-5 text-center ${compact ? 'py-6' : 'py-14'}`}><div className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-slate-50 text-slate-400"><CreditCard size={20} /></div><p className="text-xs font-bold text-slate-700">{title}</p><p className="mt-1 max-w-xs text-[11px] leading-5 text-slate-400">{detail}</p>{action && <button onClick={action} className="mt-4 flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-indigo-700"><Plus size={14} />Add transaction</button>}</div>
}

export default App
