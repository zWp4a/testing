/* Resumen: cuánto queda del sueldo, balance entre los dos y gráficos. */

import { el, today, currentMonth, monthLabel, addMonths, toCents, fromCents } from '../util.js';
import * as store from '../store.js';
import {
  balances, settleUp, monthSummary, monthlyTrend, averageMonthly,
  fixedStatus, budgetStatus, goalProgress, monthBudget,
} from '../calc.js';
import {
  fmt, fmtEn, monthNav, barList, trendChart, splitBar, listCard, listItem, emptyState,
  openSheet, closeSheet, field, input, select, footerButtons, toast, avatar,
} from '../ui.js';
import { openExpenseForm } from './expense-form.js';
import { navigate } from '../router.js';

/* ---------------------------------------------------------- sueldos del mes */

export function openIncomeForm(mKey) {
  const roster = store.people();
  const inputs = new Map();

  const campos = roster.map((p) => {
    const actual = store.incomeFor(p.id, mKey);
    const box = input({
      class: 'input input--amount',
      type: 'text',
      inputmode: 'decimal',
      placeholder: '0,00',
      value: actual.amountCents ? String(fromCents(actual.amountCents)).replace('.', ',') : '',
      'aria-label': `Líquido de ${p.name}`,
    });
    inputs.set(p.id, box);
    return el('div', { style: 'margin-bottom:14px' }, [
      el('div', { class: 'row', style: 'margin-bottom:6px' }, [
        avatar(p),
        el('span', { class: 'field__label grow', style: 'margin:0', text: p.name }),
        actual.inherited && actual.amountCents
          ? el('span', { class: 'tag', text: `viene de ${monthLabel(actual.inheritedFrom, store.state.settings.locale, 'short')}` })
          : null,
      ]),
      box,
    ]);
  });

  function save() {
    let cargados = 0;
    roster.forEach((p) => {
      const cents = toCents(inputs.get(p.id).value);
      store.setIncome(p.id, mKey, cents);
      if (cents > 0) cargados += 1;
    });
    closeSheet();
    toast(cargados ? 'Sueldos actualizados.' : 'Sueldos en cero.');
  }

  openSheet(`Sueldos de ${monthLabel(mKey, store.state.settings.locale)}`, el('div', {}, [
    el('p', { class: 'muted small', style: 'margin-bottom:16px' },
      'Poné el líquido que cobran, ya con el alquiler descontado. De acá se van restando los gastos del mes.'),
    ...campos,
    el('p', { class: 'field__hint', style: 'margin-top:-4px' },
      'Se copia solo a los meses siguientes. Si un mes cobrás distinto, lo cambiás acá y listo.'),
    footerButtons('Guardar', save),
  ]));
}

/* ------------------------------------------------------- saldar la cuenta */

export function openSettleForm(prefill = {}) {
  const roster = store.people();
  if (roster.length < 2) { toast('Necesitás al menos dos personas.'); return; }

  const moves = settleUp();
  const suggested = moves[0] || {};
  const draft = {
    fromId: prefill.fromId || suggested.fromId || roster[0].id,
    toId: prefill.toId || suggested.toId || roster[1].id,
    amountCents: prefill.amountCents ?? suggested.amountCents ?? 0,
    date: today(),
  };

  const amountInput = input({
    class: 'input input--amount', type: 'text', inputmode: 'decimal',
    value: draft.amountCents ? String(draft.amountCents / 100).replace('.', ',') : '',
    'aria-label': 'Monto',
  });
  const fromSel = select(roster.map((p) => ({ value: p.id, label: p.name })), draft.fromId,
    { onchange: (e) => { draft.fromId = e.target.value; } });
  const toSel = select(roster.map((p) => ({ value: p.id, label: p.name })), draft.toId,
    { onchange: (e) => { draft.toId = e.target.value; } });
  const dateInput = input({ type: 'date', value: draft.date });
  const noteInput = input({ type: 'text', placeholder: 'Transferencia, efectivo…' });

  function save() {
    const cents = Math.abs(Number(String(amountInput.value).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')) * 100);
    const amountCents = Math.round(cents);
    if (!amountCents) { toast('Poné el monto que se pagó.'); return; }
    if (draft.fromId === draft.toId) { toast('Elegí dos personas distintas.'); return; }
    store.add('settlements', {
      date: dateInput.value || today(),
      fromId: draft.fromId,
      toId: draft.toId,
      amountCents,
      note: noteInput.value.trim(),
    });
    closeSheet();
    toast('Pago registrado. Cuentas actualizadas.');
  }

  openSheet('Registrar pago entre ustedes', el('div', {}, [
    el('p', { class: 'muted small', style: 'margin-bottom:12px', text: 'Cuando uno le transfiere plata al otro para emparejar, cargalo acá.' }),
    field('Monto', amountInput),
    el('div', { class: 'grid-2', style: 'margin-bottom:13px' }, [
      field('Paga', fromSel),
      field('Recibe', toSel),
    ]),
    field('Fecha', dateInput),
    field('Nota (opcional)', noteInput),
    footerButtons('Registrar', save),
  ]));
}

/* ------------------------------------------------------------------ vista */

export function renderDashboard(root, params) {
  const mKey = params.month || currentMonth();
  const roster = store.people();
  const net = balances();
  const moves = settleUp(net);
  const summary = monthSummary(mKey);
  const fixed = fixedStatus(mKey);
  const avg = averageMonthly(3, mKey);
  const locale = store.state.settings.locale;

  root.append(monthNav(mKey, (m) => navigate('resumen', { month: m })));

  const budget = monthBudget(mKey);

  /* --- lo que queda: el número que miran todos los días --- */
  const hero = el('section', { class: 'hero' });
  if (!budget.hasIncome) {
    hero.append(
      el('p', { class: 'hero__label', text: 'Nos queda' }),
      el('p', { class: 'hero__value', style: 'font-size:clamp(24px,7vw,30px)', text: 'Falta el sueldo' }),
      el('p', { class: 'hero__caption', text: 'Cargá el líquido de cada uno y de ahí se descuentan los gastos.' }),
      el('div', { class: 'hero__actions' }, [
        el('button', { class: 'btn btn--primary', type: 'button', text: 'Cargar sueldos', onclick: () => openIncomeForm(mKey) }),
      ]),
    );
  } else {
    const negativo = budget.remainingCents < 0;
    hero.append(
      el('p', { class: 'hero__label', text: 'Nos queda' }),
      el('p', {
        class: 'hero__value num',
        style: negativo ? 'color:var(--critical-text)' : '',
        text: fmt(budget.remainingCents),
      }),
      el('p', { class: 'hero__caption' }, [
        `de ${fmt(budget.totalIncome)} que entraron`,
        budget.totalPending > 0
          ? el('span', { class: 'small muted', style: 'display:block;margin-top:4px' },
            `Si pagan los fijos que faltan, quedan ${fmt(budget.afterPendingCents)}`)
          : null,
      ]),
      barList([{
        label: `${Math.round(budget.usedPct * 100)}% del sueldo gastado`,
        value: budget.totalSpent,
        level: budget.usedPct >= 1 ? 'critical' : budget.usedPct >= 0.8 ? 'warning' : undefined,
      }], { max: Math.max(budget.totalIncome, budget.totalSpent, 1) }),
      el('div', { class: 'hero__actions' }, [
        el('button', { class: 'btn btn--primary', type: 'button', text: '＋ Cargar gasto', onclick: () => openExpenseForm(null, { date: defaultDateFor(mKey) }) }),
        el('button', { class: 'btn', type: 'button', text: 'Sueldos', onclick: () => openIncomeForm(mKey) }),
      ]),
    );
  }
  root.append(hero);

  /* --- cuánto le queda a cada uno --- */
  if (budget.hasIncome) {
    root.append(el('section', { class: 'card' }, [
      el('div', { class: 'card__head' }, [
        el('h2', { class: 'card__title grow', text: 'Cuánto le queda a cada uno' }),
        el('button', { class: 'linkbtn', type: 'button', text: 'Editar sueldos', onclick: () => openIncomeForm(mKey) }),
      ]),
      el('div', { class: 'stack', style: 'gap:16px' }, budget.rows.map((r) => {
        const negativo = r.remainingCents < 0;
        return el('div', {}, [
          el('div', { class: 'row', style: 'margin-bottom:7px' }, [
            avatar(r.person),
            el('span', { class: 'grow', style: 'font-weight:600', text: r.person.name }),
            el('span', {
              class: 'num',
              style: `font-size:19px;font-weight:680;${negativo ? 'color:var(--critical-text)' : ''}`,
              text: fmt(r.remainingCents),
            }),
          ]),
          barList([{
            label: `Gastó ${fmt(r.spentCents)}`,
            value: r.spentCents,
            level: r.usedPct >= 1 ? 'critical' : r.usedPct >= 0.8 ? 'warning' : undefined,
          }], {
            max: Math.max(r.incomeCents, r.spentCents, 1),
            formatValue: () => `de ${fmt(r.incomeCents)}`,
          }),
          r.pendingCents > 0
            ? el('p', { class: 'field__hint', style: 'margin-top:6px' },
              `Le faltan ${fmt(r.pendingCents)} de fijos: quedaría en ${fmt(r.afterPendingCents)}`)
            : null,
        ]);
      })),
      el('p', { class: 'field__hint', style: 'margin-top:14px' },
        'Se descuenta la parte que le toca a cada uno, no lo que puso de su bolsillo: las diferencias se emparejan abajo, en el balance.'),
    ]));
  }

  /* --- quién le debe a quién --- */
  const balanceCard = el('section', { class: 'card' }, [
    el('div', { class: 'card__head' }, [
      el('h2', { class: 'card__title grow', text: 'Entre ustedes' }),
    ]),
  ]);
  if (!moves.length) {
    balanceCard.append(el('div', { class: 'row', style: 'gap:9px' }, [
      el('span', { class: 'tag tag--good', text: 'Al día' }),
      el('span', { class: 'small muted grow', text: 'Nadie le debe nada a nadie.' }),
    ]));
  } else {
    const m = moves[0];
    balanceCard.append(
      el('div', { class: 'row row--between', style: 'align-items:baseline;margin-bottom:4px' }, [
        el('span', {}, [
          el('strong', { text: store.person(m.fromId).name }),
          ' le debe a ',
          el('strong', { text: store.person(m.toId).name }),
        ]),
        el('span', { class: 'num', style: 'font-size:19px;font-weight:680', text: fmt(m.amountCents) }),
      ]),
      el('p', { class: 'field__hint', text: 'Porque uno puso más plata de la que le tocaba. Al saldar, se empareja.' }),
      el('button', {
        class: 'btn btn--block', type: 'button', style: 'margin-top:12px',
        text: 'Registrar el pago', onclick: () => openSettleForm(),
      }),
    );
    if (moves.length > 1) {
      balanceCard.append(el('div', { class: 'stack small muted', style: 'margin-top:10px' },
        moves.slice(1).map((x) => el('span', {
          text: `${store.person(x.fromId).name} → ${store.person(x.toId).name}: ${fmt(x.amountCents)}`,
        }))));
    }
  }
  root.append(balanceCard);

  /* --- tarjetas de números --- */
  const prevTotal = monthSummary(addMonths(mKey, -1)).total;
  const delta = prevTotal ? (summary.total - prevTotal) / prevTotal : 0;
  const deltaClass = Math.abs(delta) < 0.02 ? 'flat' : (delta > 0 ? 'up' : 'down');
  const deltaText = !prevTotal ? 'Sin mes previo'
    : `${delta > 0 ? '↑' : delta < 0 ? '↓' : '='} ${Math.abs(Math.round(delta * 100))}% vs. ${monthLabel(addMonths(mKey, -1), locale, 'short').replace('.', '')}`;

  root.append(el('div', { class: 'tiles' }, [
    el('div', { class: 'tile' }, [
      el('p', { class: 'tile__label', text: 'Gastado en el mes' }),
      el('p', { class: 'tile__value', text: fmt(summary.total) }),
      el('p', { class: `tile__delta tile__delta--${deltaClass}`, text: deltaText }),
    ]),
    el('div', { class: 'tile' }, [
      el('p', { class: 'tile__label', text: 'Fijos pendientes' }),
      el('p', { class: 'tile__value', text: fmt(fixed.pendingCents) }),
      el('p', {
        class: `tile__delta tile__delta--${fixed.overdueCount ? 'up' : 'flat'}`,
        text: fixed.overdueCount
          ? `${fixed.overdueCount} vencido${fixed.overdueCount > 1 ? 's' : ''}`
          : `${fixed.pendingCount} por pagar`,
      }),
    ]),
    el('div', { class: 'tile' }, [
      el('p', { class: 'tile__label', text: 'Promedio 3 meses' }),
      el('p', { class: 'tile__value', text: fmt(avg) }),
      el('p', { class: 'tile__delta tile__delta--flat', text: `${summary.count} gastos este mes` }),
    ]),
  ]));

  /* --- avisos de vencimientos --- */
  const urgent = fixed.rows.filter((r) => r.status === 'overdue' || r.status === 'due-soon');
  if (urgent.length) {
    root.append(listCard(
      urgent.slice(0, 4).map((r) => listItem({
        icon: store.category(r.fixed.categoryId).emoji,
        title: r.fixed.name,
        subtitle: r.status === 'overdue'
          ? `Venció el ${r.dueDate.slice(8)} · hace ${Math.abs(r.daysLeft)} día${Math.abs(r.daysLeft) === 1 ? '' : 's'}`
          : r.daysLeft === 0 ? 'Vence hoy' : `Vence en ${r.daysLeft} día${r.daysLeft === 1 ? '' : 's'}`,
        amount: r.fixed.amountCents,
        tag: { level: r.status === 'overdue' ? 'critical' : 'warning', text: r.status === 'overdue' ? 'Vencido' : 'Pronto' },
        onClick: () => navigate('fijos', { month: mKey }),
      })),
      { title: 'Ojo con esto', meta: `${urgent.length} pendiente${urgent.length > 1 ? 's' : ''}` },
    ));
  }

  /* --- quién puso cuánto --- */
  if (summary.total > 0) {
    const card = el('section', { class: 'card' }, [
      el('div', { class: 'card__head' }, [
        el('h2', { class: 'card__title grow', text: 'Quién puso la plata' }),
        el('span', { class: 'card__meta', text: fmt(summary.total) }),
      ]),
      splitBar(roster.map((p) => ({ label: p.name, value: summary.paid[p.id] || 0, color: p.color }))),
      el('div', { class: 'divider' }),
      el('div', { class: 'stack' }, roster.map((p) => el('div', { class: 'row' }, [
        avatar(p),
        el('span', { class: 'grow small', text: p.name }),
        el('span', { class: 'small muted', text: 'le tocaba' }),
        el('span', { class: 'small num', style: 'font-weight:640;min-width:88px;text-align:right', text: fmt(summary.owed[p.id] || 0) }),
      ]))),
    ]);
    root.append(card);
  }

  /* --- por categoría --- */
  if (summary.categories.length) {
    root.append(el('section', { class: 'card' }, [
      el('div', { class: 'card__head' }, [
        el('h2', { class: 'card__title grow', text: 'En qué se fue' }),
        el('span', {
          class: 'card__meta',
          text: `${summary.categories.length} categoría${summary.categories.length === 1 ? '' : 's'}`,
        }),
      ]),
      barList(summary.categories.slice(0, 8).map((c) => {
        const cat = store.category(c.id);
        return { label: `${cat.emoji} ${cat.name}`, value: c.cents };
      })),
    ]));
  }

  /* --- tendencia --- */
  const trend = monthlyTrend(6, mKey);
  if (trend.some((t) => t.total > 0)) {
    root.append(el('section', { class: 'card' }, [
      el('div', { class: 'card__head' }, [
        el('h2', { class: 'card__title grow', text: 'Últimos 6 meses' }),
        el('span', { class: 'card__meta', text: 'total mensual' }),
      ]),
      trendChart(trend, { currentKey: mKey }),
    ]));
  }

  /* --- presupuestos --- */
  const budgets = budgetStatus(mKey);
  if (budgets.length) {
    root.append(el('section', { class: 'card' }, [
      el('div', { class: 'card__head' }, [
        el('h2', { class: 'card__title grow', text: 'Presupuestos' }),
        el('button', { class: 'linkbtn', type: 'button', text: 'Editar', onclick: () => navigate('ajustes') }),
      ]),
      barList(budgets.map((b) => ({
        label: `${b.category.emoji} ${b.category.name} · ${Math.round(b.pct * 100)}%`,
        value: b.used,
        level: b.level,
      })), { max: Math.max(...budgets.map((b) => Math.max(b.budget, b.used))) }),
      el('p', { class: 'field__hint', style: 'margin-top:10px', text: 'La barra se pone amarilla al 80% y roja al pasarse.' }),
    ]));
  }

  /* --- metas --- */
  const goals = store.list('goals');
  if (goals.length) {
    root.append(listCard(goals.slice(0, 3).map((g) => {
      const p = goalProgress(g);
      return listItem({
        icon: '🎯',
        title: g.name,
        subtitle: `${fmt(p.saved)} de ${fmt(p.target)} · ${Math.round(p.pct * 100)}%`,
        amount: fmt(p.remaining),
        onClick: () => navigate('metas'),
      });
    }), { title: 'Metas de ahorro' }));
  }

  /* --- últimos movimientos --- */
  if (summary.expenses.length) {
    root.append(listCard(
      summary.expenses.slice(0, 6).map((e) => expenseRow(e)),
      {
        title: 'Últimos gastos',
        action: el('button', { class: 'linkbtn', type: 'button', text: 'Ver todos', onclick: () => navigate('gastos', { month: mKey }) }),
      },
    ));
  } else {
    root.append(el('section', { class: 'card' }, [
      emptyState('🧾', 'Todavía no hay gastos en este mes',
        'Cargá el primero y la app se encarga de dividirlo y llevar la cuenta.',
        'Cargar un gasto', () => openExpenseForm(null, { date: defaultDateFor(mKey) })),
    ]));
  }

  /* --- pagos entre ustedes --- */
  const setts = store.list('settlements').filter((s) => s.date.slice(0, 7) === mKey);
  if (setts.length) {
    root.append(listCard(setts.map((s) => listItem({
      icon: '🤝',
      title: `${store.person(s.fromId).name} → ${store.person(s.toId).name}`,
      subtitle: s.note || 'Pago entre ustedes',
      amount: s.amountCents,
      onClick: async () => {
        const { confirmSheet } = await import('../ui.js');
        const ok = await confirmSheet('¿Borrar este pago?', 'Se vuelve a contar en el balance.', { confirmText: 'Borrar', danger: true });
        if (ok) { store.remove('settlements', s.id); toast('Pago eliminado.'); }
      },
    })), { title: 'Pagos entre ustedes' }));
  }
}

export function expenseRow(e) {
  const cat = store.category(e.categoryId);
  const payer = store.person(e.paidBy);
  return listItem({
    icon: cat.emoji,
    title: e.description,
    subtitle: `${payer.name} · ${cat.name}`
      + (e.fx ? ` · ${fmtEn(e.fx.amountCents, e.fx.currency)}` : '')
      + (e.installment ? ` · cuota ${e.installment.n}/${e.installment.of}` : ''),
    amount: e.amountCents,
    onClick: () => openExpenseForm(e),
  });
}

function defaultDateFor(mKey) {
  const t = today();
  return t.slice(0, 7) === mKey ? t : `${mKey}-01`;
}
