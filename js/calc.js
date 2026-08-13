/* Cálculos: reparto de gastos, balances, resúmenes mensuales y vencimientos. */

import { list, people, get } from './store.js';
import { allocate, monthKey, currentMonth, addMonths, clampDay, today, daysBetween } from './util.js';

/**
 * Cuánto le corresponde pagar a cada persona de un gasto.
 * - equal:  en partes iguales entre quienes participan
 * - single: lo banca una sola persona (splitTo)
 * - custom: porcentajes por persona (splitPct)
 * Devuelve { personId: centavos }, siempre sumando el total exacto.
 */
export function sharesOf(expense, roster = people()) {
  const ids = roster.map((p) => p.id);
  const total = expense.amountCents || 0;

  if (expense.splitMode === 'single') {
    const target = expense.splitTo && ids.includes(expense.splitTo) ? expense.splitTo : expense.paidBy;
    const out = {};
    ids.forEach((id) => { out[id] = 0; });
    if (out[target] !== undefined) out[target] = total;
    else if (ids.length) out[ids[0]] = total;
    return out;
  }

  if (expense.splitMode === 'custom' && expense.splitPct) {
    const weights = {};
    ids.forEach((id) => { weights[id] = Number(expense.splitPct[id]) || 0; });
    const sum = Object.values(weights).reduce((s, n) => s + n, 0);
    if (sum > 0) return allocate(total, weights);
  }

  const weights = {};
  ids.forEach((id) => { weights[id] = 1; });
  return allocate(total, weights);
}

/** Gastos de un mes (YYYY-MM), más nuevos primero. */
export function expensesOfMonth(mKey) {
  return list('expenses')
    .filter((e) => monthKey(e.date) === mKey)
    .sort((a, b) => (b.date === a.date ? (b.createdAt || b.updatedAt || '').localeCompare(a.createdAt || a.updatedAt || '') : b.date.localeCompare(a.date)));
}

export function settlementsOfMonth(mKey) {
  return list('settlements').filter((s) => monthKey(s.date) === mKey);
}

/**
 * Balance acumulado (histórico completo, no sólo el mes): lo que cada uno puso
 * menos lo que le tocaba, ajustado por los pagos entre personas ya hechos.
 * Positivo = le deben. Negativo = debe.
 */
export function balances({ upToMonth = null } = {}) {
  const roster = people();
  const net = {};
  roster.forEach((p) => { net[p.id] = 0; });

  const inRange = (dateKey) => !upToMonth || monthKey(dateKey) <= upToMonth;

  list('expenses').forEach((e) => {
    if (!inRange(e.date)) return;
    if (net[e.paidBy] !== undefined) net[e.paidBy] += e.amountCents || 0;
    const shares = sharesOf(e, roster);
    Object.entries(shares).forEach(([id, cents]) => {
      if (net[id] !== undefined) net[id] -= cents;
    });
  });

  list('settlements').forEach((s) => {
    if (!inRange(s.date)) return;
    // "from" le pagó a "to": el que pagó reduce su deuda.
    if (net[s.fromId] !== undefined) net[s.fromId] += s.amountCents || 0;
    if (net[s.toId] !== undefined) net[s.toId] -= s.amountCents || 0;
  });

  return net;
}

/**
 * Transferencias mínimas para dejar todo en cero.
 * Con dos personas es una sola línea; con más, va saldando el mayor deudor
 * contra el mayor acreedor.
 */
export function settleUp(net = balances()) {
  const debtors = [];
  const creditors = [];
  Object.entries(net).forEach(([id, cents]) => {
    if (cents < -1) debtors.push({ id, amount: -cents });
    else if (cents > 1) creditors.push({ id, amount: cents });
  });
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const moves = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount);
    if (amount > 0) moves.push({ fromId: debtors[i].id, toId: creditors[j].id, amountCents: amount });
    debtors[i].amount -= amount;
    creditors[j].amount -= amount;
    if (debtors[i].amount <= 1) i += 1;
    if (creditors[j].amount <= 1) j += 1;
  }
  return moves;
}

/** Totales del mes: general, por persona (pagado y consumido) y por categoría. */
export function monthSummary(mKey) {
  const roster = people();
  const rows = expensesOfMonth(mKey);
  const paid = {};
  const owed = {};
  roster.forEach((p) => { paid[p.id] = 0; owed[p.id] = 0; });

  const byCategory = new Map();
  let total = 0;

  rows.forEach((e) => {
    total += e.amountCents || 0;
    if (paid[e.paidBy] !== undefined) paid[e.paidBy] += e.amountCents || 0;
    const shares = sharesOf(e, roster);
    Object.entries(shares).forEach(([id, cents]) => {
      if (owed[id] !== undefined) owed[id] += cents;
    });
    const key = e.categoryId || 'otros';
    byCategory.set(key, (byCategory.get(key) || 0) + (e.amountCents || 0));
  });

  const categories = [...byCategory.entries()]
    .map(([id, cents]) => ({ id, cents }))
    .sort((a, b) => b.cents - a.cents);

  return { month: mKey, total, count: rows.length, paid, owed, categories, expenses: rows };
}

/** Serie de totales para el gráfico de tendencia. */
export function monthlyTrend(months = 6, endMonth = currentMonth()) {
  const out = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const m = addMonths(endMonth, -i);
    const total = list('expenses')
      .filter((e) => monthKey(e.date) === m)
      .reduce((s, e) => s + (e.amountCents || 0), 0);
    out.push({ month: m, total });
  }
  return out;
}

export function averageMonthly(months = 3, endMonth = currentMonth()) {
  const series = monthlyTrend(months + 1, endMonth).slice(0, months); // sin el mes en curso
  const withData = series.filter((s) => s.total > 0);
  if (!withData.length) return 0;
  return Math.round(withData.reduce((s, x) => s + x.total, 0) / withData.length);
}

/* ------------------------------------------------------------ gastos fijos */

/** ¿Ya se cargó este fijo en este mes? Devuelve el gasto o null. */
export function fixedExpenseFor(fixedId, mKey) {
  return list('expenses').find((e) => e.fixedId === fixedId && monthKey(e.date) === mKey) || null;
}

/**
 * Estado de los gastos fijos de un mes: pagados, pendientes y vencidos.
 * `dueDate` respeta meses cortos (un fijo el 31 cae el 28 en febrero).
 */
export function fixedStatus(mKey) {
  const t = today();
  const rows = list('fixed').filter((f) => f.active !== false).map((f) => {
    const day = clampDay(mKey, f.dayOfMonth);
    const dueDate = `${mKey}-${String(day).padStart(2, '0')}`;
    const expense = fixedExpenseFor(f.id, mKey);
    const daysLeft = daysBetween(t, dueDate);
    let status = 'pending';
    if (expense) status = 'paid';
    else if (daysLeft < 0) status = 'overdue';
    else if (daysLeft <= 5) status = 'due-soon';
    return { fixed: f, dueDate, daysLeft, expense, status };
  });
  rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const pendingCents = rows.filter((r) => !r.expense).reduce((s, r) => s + (r.fixed.amountCents || 0), 0);
  return {
    rows,
    pendingCents,
    pendingCount: rows.filter((r) => !r.expense).length,
    overdueCount: rows.filter((r) => r.status === 'overdue').length,
  };
}

/** Lo que falta pagar este mes = fijos pendientes (para el "te queda por pagar"). */
export function projectedMonthTotal(mKey) {
  const summary = monthSummary(mKey);
  const { pendingCents } = fixedStatus(mKey);
  return summary.total + pendingCents;
}

/* ---------------------------------------------------------------- compras */

export function shoppingSummary() {
  const items = list('shopping');
  const pending = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);
  const priceOf = (i) => (i.estPriceCents || i.lastPriceCents || 0) * (i.qty || 1);
  return {
    items,
    pending,
    done,
    estimatedCents: items.reduce((s, i) => s + priceOf(i), 0),
    cartCents: done.reduce((s, i) => s + priceOf(i), 0),
  };
}

/* ------------------------------------------------------------ presupuestos */

export function budgetStatus(mKey) {
  const summary = monthSummary(mKey);
  const spent = new Map(summary.categories.map((c) => [c.id, c.cents]));
  return list('categories')
    .filter((c) => (c.budgetCents || 0) > 0)
    .map((c) => {
      const used = spent.get(c.id) || 0;
      const pct = c.budgetCents ? used / c.budgetCents : 0;
      let level = 'good';
      if (pct >= 1) level = 'critical';
      else if (pct >= 0.8) level = 'warning';
      return { category: c, used, budget: c.budgetCents, pct, level };
    })
    .sort((a, b) => b.pct - a.pct);
}

/* --------------------------------------------------------------- metas */

export function goalProgress(goal) {
  const saved = (goal.contributions || []).reduce((s, c) => s + (c.amountCents || 0), 0);
  const target = goal.targetCents || 0;
  return {
    saved,
    target,
    pct: target > 0 ? Math.min(1, saved / target) : 0,
    remaining: Math.max(0, target - saved),
  };
}

/* ------------------------------------------------------------ exportar CSV */

export function toCsv(mKey = null) {
  const rows = mKey ? expensesOfMonth(mKey) : list('expenses').slice().sort((a, b) => a.date.localeCompare(b.date));
  const roster = people();
  const header = ['Fecha', 'Descripción', 'Categoría', 'Monto', 'Pagó', ...roster.map((p) => `Le toca a ${p.name}`), 'Nota'];
  const esc = (v) => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.map(esc).join(';')];
  rows.forEach((e) => {
    const shares = sharesOf(e, roster);
    const cat = get('categories', e.categoryId);
    lines.push([
      e.date,
      e.description,
      cat ? cat.name : e.categoryId,
      ((e.amountCents || 0) / 100).toFixed(2).replace('.', ','),
      (get('people', e.paidBy) || {}).name || '',
      ...roster.map((p) => ((shares[p.id] || 0) / 100).toFixed(2).replace('.', ',')),
      e.note || '',
    ].map(esc).join(';'));
  });
  return `﻿${lines.join('\n')}`;
}
