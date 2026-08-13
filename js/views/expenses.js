/* Listado de gastos del mes, con búsqueda y filtros. */

import { el, currentMonth, dateLabel, today } from '../util.js';
import * as store from '../store.js';
import { expensesOfMonth, sharesOf, toCsv } from '../calc.js';
import {
  fmt, monthNav, listCard, listItem, emptyState, input, select, toast,
} from '../ui.js';
import { openExpenseForm } from './expense-form.js';
import { navigate } from '../router.js';
import { download } from '../util.js';

const filters = { q: '', categoryId: '', paidBy: '' };

export function renderExpenses(root, params) {
  const mKey = params.month || currentMonth();
  const locale = store.state.settings.locale;
  const roster = store.people();
  const all = expensesOfMonth(mKey);

  root.append(monthNav(mKey, (m) => navigate('gastos', { month: m })));

  /* --- filtros --- */
  const searchInput = input({
    type: 'search', placeholder: 'Buscar gasto…', value: filters.q,
    dataset: { focusKey: 'buscador' },
    oninput: (e) => { filters.q = e.target.value; paint(); },
  });
  const catSel = select(
    [{ value: '', label: 'Todas las categorías' }, ...store.categories().map((c) => ({ value: c.id, label: `${c.emoji} ${c.name}` }))],
    filters.categoryId,
    { onchange: (e) => { filters.categoryId = e.target.value; paint(); } },
  );
  const paidSel = select(
    [{ value: '', label: 'Pagó cualquiera' }, ...roster.map((p) => ({ value: p.id, label: `Pagó ${p.name}` }))],
    filters.paidBy,
    { onchange: (e) => { filters.paidBy = e.target.value; paint(); } },
  );

  root.append(el('section', { class: 'card' }, [
    el('div', { style: 'margin-bottom:10px' }, [searchInput]),
    el('div', { class: 'grid-2' }, [catSel, paidSel]),
  ]));

  const container = el('div');
  root.append(container);

  function paint() {
    container.replaceChildren();
    const q = filters.q.trim().toLowerCase();
    const rows = all.filter((e) => {
      if (filters.categoryId && e.categoryId !== filters.categoryId) return false;
      if (filters.paidBy && e.paidBy !== filters.paidBy) return false;
      if (q) {
        const hay = `${e.description} ${store.category(e.categoryId).name} ${e.note || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (!rows.length) {
      container.append(el('section', { class: 'card' }, [
        all.length
          ? emptyState('🔍', 'Nada con ese filtro', 'Probá con otra búsqueda o limpiá los filtros.', 'Limpiar filtros', () => {
            filters.q = ''; filters.categoryId = ''; filters.paidBy = '';
            navigate('gastos', { month: mKey });
          })
          : emptyState('🧾', 'Mes sin gastos', 'Cargá el primero con el botón ＋.', 'Cargar gasto', () => openExpenseForm(null, { date: defaultDateFor(mKey) })),
      ]));
      return;
    }

    const total = rows.reduce((s, e) => s + (e.amountCents || 0), 0);

    /* Agrupado por día, como un extracto bancario. */
    const groups = new Map();
    rows.forEach((e) => {
      if (!groups.has(e.date)) groups.set(e.date, []);
      groups.get(e.date).push(e);
    });

    const children = [];
    [...groups.entries()].forEach(([date, items]) => {
      const dayTotal = items.reduce((s, e) => s + (e.amountCents || 0), 0);
      children.push(el('div', { class: 'list__group row row--between' }, [
        el('span', { text: dateLabel(date, locale) }),
        el('span', { class: 'num', text: fmt(dayTotal) }),
      ]));
      items.forEach((e) => {
        const cat = store.category(e.categoryId);
        const payer = store.person(e.paidBy);
        const shares = sharesOf(e, roster);
        const mine = store.me();
        const myShare = shares[mine.id] || 0;
        children.push(listItem({
          icon: cat.emoji,
          title: e.description,
          subtitle: `Pagó ${payer.name} · te toca ${fmt(myShare)}${e.installment ? ` · cuota ${e.installment.n}/${e.installment.of}` : ''}`,
          amount: e.amountCents,
          onClick: () => openExpenseForm(e),
        }));
      });
    });

    container.append(listCard(children, {
      title: `${rows.length} gasto${rows.length === 1 ? '' : 's'}`,
      meta: fmt(total),
    }));

    container.append(el('div', { class: 'row', style: 'gap:8px;margin-top:4px' }, [
      el('button', {
        class: 'btn btn--sm grow', type: 'button', text: '⬇ Exportar CSV del mes',
        onclick: () => {
          download(`gastos-${mKey}.csv`, toCsv(mKey), 'text/csv');
          toast('CSV descargado. Se abre en Excel o Sheets.');
        },
      }),
    ]));
  }

  paint();
}

function defaultDateFor(mKey) {
  const t = today();
  return t.slice(0, 7) === mKey ? t : `${mKey}-01`;
}
