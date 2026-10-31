// Routines drawer: the list of routines (play / edit) and the routine editor.

import { $, el } from './dom.js';
import { sanitizeRoutine, routineMinutes, newId, MINUTES, MAX_ITEMS } from '../routines.js';
import { BPM_MIN, BPM_MAX, STEPPERS } from '../settings.js';

export class RoutinesPanel {
  /**
   * @param {object} o
   * @param {HTMLElement} o.root
   * @param {object[]} o.rudiments  parsed patterns (for names)
   * @param {object[]} o.groups     from groupRudiments() (for the picker)
   * @param {(routine: object) => void} o.onPlay
   * @param {(list: object[]) => void} o.onChange  the list was edited; persist it
   */
  constructor({ root, rudiments, groups, onPlay, onChange }) {
    Object.assign(this, { root, rudiments, groups, onPlay, onChange });
    this.ids = rudiments.map((r) => r.id);
    this.list = [];
    this.draft = null; // routine being edited (a copy), or null for the list view
  }

  render(list = this.list) {
    this.list = list;
    this.root.textContent = '';
    if (this.draft) this._renderEditor();
    else this._renderList();
  }

  /** Leave the editor without saving (e.g. when the drawer closes). */
  cancelEdit() {
    if (!this.draft) return;
    this.draft = null;
    this.render();
  }

  _name(id) {
    return this.rudiments.find((r) => r.id === id)?.name ?? id;
  }

  // ---- list ------------------------------------------------------------------

  _renderList() {
    const add = el('button', 'chip primary', '+ New routine');
    add.type = 'button';
    add.addEventListener('click', () => this._edit(null));
    const head = el('div', 'panel-actions');
    head.append(add);
    this.root.append(head, el('p', 'hint panel-hint',
      'Each rudiment plays for its time after a count-in, then the next one starts.'));

    if (!this.list.length) {
      this.root.append(el('p', 'empty', 'No routines yet.'));
      return;
    }
    for (const r of this.list) {
      const card = el('div', 'routine');
      const main = el('div', 'routine-main');
      main.append(
        el('div', 'routine-name', r.name),
        el('div', 'routine-meta', `${r.items.length} ${r.items.length === 1 ? 'rudiment' : 'rudiments'} · ${routineMinutes(r)} min`),
        el('div', 'routine-items', r.items.map((it) => `${this._name(it.rudiment)} ${it.mode === 'oco' ? `${it.bpm}–${it.ocoHigh}` : it.bpm}`).join('  ·  ')),
      );
      const btns = el('div', 'routine-btns');
      const play = el('button', 'chip primary', '▶ Play');
      play.type = 'button';
      play.setAttribute('aria-label', `Play ${r.name}`);
      play.addEventListener('click', () => this.onPlay(r));
      const edit = el('button', 'chip', 'Edit');
      edit.type = 'button';
      edit.setAttribute('aria-label', `Edit ${r.name}`);
      edit.addEventListener('click', () => this._edit(r));
      btns.append(play, edit);
      card.append(main, btns);
      this.root.append(card);
    }
  }

  // ---- editor ----------------------------------------------------------------

  _edit(routine) {
    this.draft = routine
      ? structuredClone(routine)
      : { id: newId(), name: '', items: [{ rudiment: this.ids[0], bpm: 80, minutes: 2, mode: 'loop', ocoHigh: 110 }], isNew: true };
    this.render();
    $('input', this.root)?.focus({ preventScroll: true });
  }

  _renderEditor() {
    const d = this.draft;
    const name = el('input', 'text-input');
    Object.assign(name, { type: 'text', maxLength: 60, value: d.name, placeholder: 'Routine name' });
    name.setAttribute('aria-label', 'Routine name');
    name.addEventListener('input', () => { d.name = name.value; });
    this.root.append(name);

    const items = el('div', 'items');
    d.items.forEach((it, i) => items.append(this._itemRow(it, i)));
    this.root.append(items);

    if (d.items.length < MAX_ITEMS) {
      const add = el('button', 'chip add-item', '+ Add rudiment');
      add.type = 'button';
      add.addEventListener('click', () => {
        const last = d.items.at(-1);
        d.items.push(last ? { ...last } : { rudiment: this.ids[0], bpm: 80, minutes: 2, mode: 'loop', ocoHigh: 110 });
        this.render();
      });
      this.root.append(add);
    }

    const actions = el('div', 'editor-actions');
    if (!d.isNew) {
      const del = el('button', 'chip danger', 'Delete');
      del.type = 'button';
      del.addEventListener('click', () => {
        if (!confirm(`Delete the routine “${d.name || 'Routine'}”?`)) return;
        this.draft = null;
        this.onChange(this.list.filter((r) => r.id !== d.id));
      });
      actions.append(del);
    }
    actions.append(el('span', 'spacer'));
    const cancel = el('button', 'chip', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => this.cancelEdit());
    const save = el('button', 'chip primary', 'Save');
    save.type = 'button';
    save.addEventListener('click', () => this._save());
    actions.append(cancel, save);
    this.root.append(actions);
  }

  _itemRow(it, i) {
    const d = this.draft;
    const row = el('div', 'item-row');

    const top = el('div', 'item-top');
    const select = el('select', 'select');
    select.setAttribute('aria-label', `Rudiment ${i + 1}`);
    for (const { collection, families } of this.groups) {
      for (const family of families) {
        const group = el('optgroup');
        group.label = `${collection.name} · ${family.name}`;
        for (const r of family.rudiments) {
          const opt = el('option', null, r.name);
          opt.value = r.id;
          group.append(opt);
        }
        select.append(group);
      }
    }
    select.value = it.rudiment;
    select.addEventListener('change', () => { it.rudiment = select.value; });
    top.append(el('span', 'item-no', String(i + 1)), select);

    const fields = el('div', 'item-fields');
    const num = (label, key, min, max) => {
      const wrap = el('label', 'num');
      const input = el('input');
      Object.assign(input, { type: 'number', inputMode: 'numeric', min, max, step: 1, value: it[key] });
      input.addEventListener('input', () => { it[key] = Number(input.value); });
      wrap.append(el('span', null, label), input);
      return wrap;
    };
    const top2 = num('Top', 'ocoHigh', STEPPERS.ocoHigh.min, STEPPERS.ocoHigh.max);
    top2.hidden = it.mode !== 'oco';
    const mode = el('select', 'select');
    mode.setAttribute('aria-label', `Mode for rudiment ${i + 1}`);
    for (const [v, label] of [['loop', 'Loop'], ['oco', 'Open–close–open']]) {
      const opt = el('option', null, label);
      opt.value = v;
      mode.append(opt);
    }
    mode.value = it.mode;
    mode.addEventListener('change', () => {
      it.mode = mode.value;
      top2.hidden = it.mode !== 'oco';
    });
    fields.append(num('BPM', 'bpm', BPM_MIN, BPM_MAX), num('Min', 'minutes', MINUTES.min, MINUTES.max), mode, top2);

    const btns = el('div', 'item-btns');
    const btn = (label, aria, fn, disabled = false) => {
      const b = el('button', 'icon-btn', label);
      b.type = 'button';
      b.disabled = disabled;
      b.setAttribute('aria-label', aria);
      b.addEventListener('click', fn);
      btns.append(b);
    };
    const move = (to) => {
      const [x] = d.items.splice(i, 1);
      d.items.splice(to, 0, x);
      this.render();
    };
    btn('↑', `Move rudiment ${i + 1} up`, () => move(i - 1), i === 0);
    btn('↓', `Move rudiment ${i + 1} down`, () => move(i + 1), i === d.items.length - 1);
    btn('✕', `Remove rudiment ${i + 1}`, () => { d.items.splice(i, 1); this.render(); }, d.items.length === 1);

    row.append(top, fields, btns);
    return row;
  }

  _save() {
    const d = this.draft;
    const clean = sanitizeRoutine({ ...d, name: d.name || 'Routine' }, this.ids);
    if (!clean) return;
    const at = this.list.findIndex((r) => r.id === clean.id);
    const list = [...this.list];
    if (at >= 0) list[at] = clean;
    else list.push(clean);
    this.draft = null;
    this.onChange(list);
  }
}
