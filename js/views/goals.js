/* Metas de ahorro compartidas: vacaciones, mudanza, el fondo de emergencia. */

import { el, toCents, fromCents, today, uid, daysBetween } from '../util.js';
import * as store from '../store.js';
import { goalProgress } from '../calc.js';
import {
  fmt, emptyState, barList, field, input, segmented,
  footerButtons, openSheet, closeSheet, toast, confirmSheet, avatar,
} from '../ui.js';

function openGoalForm(existing = null) {
  const isEdit = Boolean(existing);
  const nameInput = input({ type: 'text', placeholder: 'Vacaciones, mudanza, auto…', value: existing?.name || '' });
  const targetInput = input({
    class: 'input input--amount', type: 'text', inputmode: 'decimal',
    value: existing?.targetCents ? String(fromCents(existing.targetCents)).replace('.', ',') : '',
    'aria-label': 'Objetivo',
  });
  const deadlineInput = input({ type: 'date', value: existing?.deadline || '' });

  function save() {
    const name = nameInput.value.trim();
    if (!name) { toast('Ponele un nombre a la meta.'); return; }
    const payload = {
      name,
      targetCents: toCents(targetInput.value),
      deadline: deadlineInput.value || '',
    };
    if (isEdit) store.update('goals', existing.id, payload);
    else store.add('goals', { ...payload, contributions: [] });
    closeSheet();
    toast(isEdit ? 'Meta actualizada.' : 'Meta creada.');
  }

  async function del() {
    const ok = await confirmSheet('¿Borrar la meta?', `Se elimina "${existing.name}" y lo que anotaron ahí.`, { confirmText: 'Borrar', danger: true });
    if (!ok) return;
    store.remove('goals', existing.id);
    toast('Meta eliminada.', { action: 'Deshacer', onAction: () => store.restore('goals', existing.id) });
  }

  openSheet(isEdit ? 'Editar meta' : 'Nueva meta', el('div', {}, [
    field('Nombre', nameInput),
    field('Objetivo', targetInput),
    field('Fecha límite (opcional)', deadlineInput, 'Con esto te calculamos cuánto guardar por mes.'),
    footerButtons(isEdit ? 'Guardar' : 'Crear meta', save, {
      extra: isEdit ? el('button', { class: 'btn btn--danger', type: 'button', text: 'Borrar', onclick: del }) : null,
    }),
  ]));
}

function openContribution(goal) {
  const roster = store.people();
  const amountInput = input({ class: 'input input--amount', type: 'text', inputmode: 'decimal', 'aria-label': 'Monto' });
  let personId = store.me().id;
  const dateInput = input({ type: 'date', value: today() });

  function save() {
    const cents = toCents(amountInput.value);
    if (!cents) { toast('Poné cuánto guardaron.'); return; }
    const contributions = [...(goal.contributions || []), {
      id: uid(), date: dateInput.value || today(), personId, amountCents: cents,
    }];
    store.update('goals', goal.id, { contributions });
    closeSheet();
    toast(`${fmt(cents)} sumados a ${goal.name}.`);
  }

  openSheet(`Guardar para ${goal.name}`, el('div', {}, [
    field('Monto', amountInput),
    field('¿Quién puso?', segmented(roster.map((p) => ({ value: p.id, label: p.name })), personId, (v) => { personId = v; })),
    field('Fecha', dateInput),
    footerButtons('Sumar', save),
  ]));
  setTimeout(() => amountInput.focus(), 60);
}

function monthlyNeeded(goal, progress) {
  if (!goal.deadline || progress.remaining <= 0) return null;
  const days = daysBetween(today(), goal.deadline);
  if (days <= 0) return null;
  const months = Math.max(1, Math.round(days / 30));
  return { months, perMonth: Math.ceil(progress.remaining / months) };
}

export function renderGoals(root) {
  const goals = store.list('goals');

  if (!goals.length) {
    root.append(el('section', { class: 'card' }, [
      emptyState('🎯', 'Sin metas todavía',
        'Un viaje, la mudanza, el fondo para imprevistos. Anotá cuánto quieren juntar y cuánto van poniendo.',
        'Crear una meta', () => openGoalForm()),
    ]));
    return;
  }

  goals.forEach((goal) => {
    const p = goalProgress(goal);
    const need = monthlyNeeded(goal, p);
    const byPerson = new Map();
    (goal.contributions || []).forEach((c) => {
      byPerson.set(c.personId, (byPerson.get(c.personId) || 0) + c.amountCents);
    });

    const card = el('section', { class: 'card' }, [
      el('div', { class: 'card__head' }, [
        el('h2', { class: 'card__title grow', style: 'font-size:16px', text: goal.name }),
        el('button', { class: 'linkbtn', type: 'button', text: 'Editar', onclick: () => openGoalForm(goal) }),
      ]),
      el('div', { class: 'row row--between', style: 'align-items:baseline;margin-bottom:8px' }, [
        el('span', { style: 'font-size:24px;font-weight:700;letter-spacing:-.02em', class: 'num', text: fmt(p.saved) }),
        el('span', { class: 'muted small', text: `de ${fmt(p.target)}` }),
      ]),
      barList([{
        label: `${Math.round(p.pct * 100)}% juntado`,
        value: p.saved,
        level: p.pct >= 1 ? 'good' : undefined,
      }], { max: Math.max(p.target, p.saved, 1) }),
      el('p', { class: 'field__hint', style: 'margin-top:9px' }, [
        p.remaining > 0
          ? `Faltan ${fmt(p.remaining)}${need ? ` · ${fmt(need.perMonth)} por mes durante ${need.months} ${need.months === 1 ? 'mes' : 'meses'}` : ''}`
          : '¡Meta cumplida! 🎉',
      ]),
    ]);

    if (byPerson.size) {
      card.append(el('div', { class: 'divider' }));
      card.append(el('div', { class: 'stack' }, [...byPerson.entries()].map(([pid, cents]) => {
        const per = store.person(pid);
        return el('div', { class: 'row' }, [
          avatar(per),
          el('span', { class: 'grow small', text: per.name }),
          el('span', { class: 'small num', style: 'font-weight:620', text: fmt(cents) }),
        ]);
      })));
    }

    card.append(el('button', {
      class: 'btn btn--primary btn--block', type: 'button', style: 'margin-top:14px',
      text: '＋ Sumar ahorro', onclick: () => openContribution(goal),
    }));

    const contribs = (goal.contributions || []).slice().sort((a, b) => b.date.localeCompare(a.date));
    if (contribs.length) {
      card.append(el('details', { style: 'margin-top:12px' }, [
        el('summary', { class: 'small muted', style: 'cursor:pointer', text: `Ver los ${contribs.length} aportes` }),
        el('div', { class: 'stack', style: 'margin-top:10px' }, contribs.map((c) => el('div', { class: 'row' }, [
          el('span', { class: 'grow small', text: `${store.person(c.personId).name} · ${c.date}` }),
          el('span', { class: 'small num', text: fmt(c.amountCents) }),
          el('button', {
            class: 'iconbtn', type: 'button', 'aria-label': 'Borrar aporte', text: '✕',
            style: 'width:30px;height:30px;font-size:13px',
            onclick: () => {
              store.update('goals', goal.id, {
                contributions: (goal.contributions || []).filter((x) => x.id !== c.id),
              });
              toast('Aporte borrado.');
            },
          }),
        ]))),
      ]));
    }

    root.append(card);
  });

  root.append(el('button', {
    class: 'btn btn--block', type: 'button', text: '＋ Nueva meta', onclick: () => openGoalForm(),
  }));
}
