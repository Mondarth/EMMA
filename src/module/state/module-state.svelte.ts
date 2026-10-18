import { SvelteSet } from 'svelte/reactivity';

import type { ActivationMap, ModuleEntry } from '@module/adapters/modules';
import type { ModuleRow } from '@module/state/grouping';
import { conflictedModules, groupRows, relatedModules, withRequired } from '@module/state/grouping';

/** The two lists of the split view: modules that are inactive, and modules that are active. */
export type Side = 'inactive' | 'active';

/**
 * How a click changes a side's selection: `replace` selects only the clicked module (a plain click), `toggle` adds or
 * removes it (Ctrl/Cmd-click), and `range` selects every module from the last plain or toggled click to it
 * (Shift-click).
 */
export type SelectMode = 'replace' | 'toggle' | 'range';

/** A module that will be active while modules it requires will not. */
export interface UnmetRequirement {
  /** The module with the unmet requirement. */
  readonly entry: ModuleEntry;
  /** The titles of the required modules that will not be active, or the IDs of those not installed. */
  readonly missing: readonly string[];
}

/** Options for a {@link ModuleState}. */
export interface ModuleStateOptions {
  /**
   * Whether activating a module also activates the modules it recommends, read each time a module is activated so a
   * change to the setting applies at once. By default it does not.
   */
  autoRecommended?: () => boolean;
}

/**
 * The state behind EMMA's views: the installed modules, which of them the world has saved as active, the changes
 * staged on top of that, what is selected on each side of the split view, and whose details drawer is open.
 *
 * Activating a module in the list view also activates the modules it requires, following the chain, and, if
 * `autoRecommended` says so, those it recommends. Deactivating it deactivates those of them that were activated only
 * for it and that no other active module still needs.
 *
 * Moving modules between the sides only stages the change; nothing reaches Foundry until the staged activation is
 * saved through the adapter (`writeActivation`), after which {@link ModuleState.markSaved} makes it the new baseline.
 * The state is reactive: components reading it update when it changes.
 */
export class ModuleState {
  /** Every installed module, in display order. */
  readonly entries: readonly ModuleEntry[];

  #saved: ActivationMap = $state.raw({});
  #pending: Record<string, boolean> = $state({});
  /** The modules the user selected on each side; {@link ModuleState.selected} adds what they require. */
  readonly #chosen: Record<Side, SvelteSet<string>> = { inactive: new SvelteSet(), active: new SvelteSet() };
  /** Where each side's next range selection starts. */
  readonly #anchor: Record<Side, string | null> = { inactive: null, active: null };
  /** The modules whose details drawer is open, in either view and on either side. */
  readonly #expanded = new SvelteSet<string>();
  /**
   * The modules activated only because an active module requires or recommends them, which are deactivated again
   * once no active module does.
   */
  readonly #implied = new SvelteSet<string>();
  readonly #autoRecommended: () => boolean;

  /** The modules that will be inactive once the staged changes are saved, in display order. */
  readonly inactive: readonly ModuleEntry[] = $derived.by(() => this.#side('inactive'));

  /** The modules that will be active once the staged changes are saved, in display order. */
  readonly active: readonly ModuleEntry[] = $derived.by(() => this.#side('active'));

  /** The modules selected on the inactive side: those chosen, and those they require on that side. */
  readonly #selectedInactive: ReadonlySet<string> = $derived.by(() => this.#withRequired('inactive'));

  /** The modules selected on the active side: those chosen, and those they require there that are not locked. */
  readonly #selectedActive: ReadonlySet<string> = $derived.by(() => this.#withRequired('active'));

  /**
   * The inactive side's rows: its modules, with the modules each selected module requires or recommends there grouped
   * under it.
   */
  // Inactive modules are never locked, so the selection already holds each selected module's chain of requirements.
  readonly #inactiveRows: readonly ModuleRow[] = $derived.by(() =>
    groupRows(this.inactive, id => this.#selectedInactive.has(id)),
  );

  /**
   * The active side's rows: its modules, with the modules each selected module requires or recommends grouped under
   * it. A recommended module still inactive is grouped there too, for the user to confirm.
   */
  readonly #activeRows: readonly ModuleRow[] = $derived.by(() => {
    const recommended = this.active
      .filter(({ id }) => this.#selectedActive.has(id))
      .flatMap(entry => relatedModules(entry, this.entries).recommended)
      .filter(({ id }) => this.#pending[id] !== true)
      .map(({ id }) => id);
    // The chain of requirements is grouped too, though locked modules in it cannot be selected.
    const parents = withRequired(this.active, this.#selectedActive, () => false);
    return groupRows(
      this.entries.filter(({ id }) => this.#pending[id] === true || recommended.includes(id)),
      id => parents.includes(id),
    );
  });

  /** The staged changes: the new activation of each module that differs from what is saved. */
  readonly changes: ActivationMap = $derived.by(() =>
    Object.fromEntries(
      this.entries
        .filter(({ id }) => this.#pending[id] !== this.#saved[id])
        .map(({ id }) => [id, this.#pending[id] === true]),
    ),
  );

  /** Whether any change is staged. */
  readonly dirty: boolean = $derived(Object.keys(this.changes).length > 0);

  /**
   * The modules that will be active, once the staged changes are saved, without every module they require, in display
   * order. Foundry refuses to save such an activation, so it must be empty before saving.
   */
  readonly unmet: readonly UnmetRequirement[] = $derived.by(() => {
    const titles: Record<string, string> = Object.fromEntries(this.entries.map(({ id, title }) => [id, title]));
    return this.entries
      .filter(({ id }) => this.#pending[id] === true)
      .map(entry => ({
        entry,
        missing: entry.requires.filter(id => this.#pending[id] !== true).map(id => titles[id] ?? id),
      }))
      .filter(({ missing }) => missing.length > 0);
  });

  /**
   * The list view's rows: every module, with the modules each active module requires or recommends grouped under it
   * rather than at their own place.
   */
  readonly rows: readonly ModuleRow[] = $derived.by(() => groupRows(this.entries, id => this.#pending[id] === true));

  /**
   * The inactive modules that conflict with a module that will be active: either declares the conflict. Activating
   * one of them would make Foundry load conflicting modules together.
   */
  readonly conflicted: ReadonlySet<string> = $derived.by(() =>
    conflictedModules(this.entries, id => this.#pending[id] === true),
  );

  /** The active modules each module is required by, keyed by the required module's ID, in display order. */
  readonly #requiredBy: Readonly<Record<string, readonly ModuleEntry[]>> = $derived.by(() => {
    const parents: Record<string, ModuleEntry[]> = {};
    for (const entry of this.entries) {
      if (this.#pending[entry.id] !== true) continue;
      for (const { id } of relatedModules(entry, this.entries).required) (parents[id] ??= []).push(entry);
    }
    return parents;
  });

  /**
   * @param entries - The installed modules, in display order
   * @param saved - Which modules the world has saved as active; modules missing from it are inactive
   * @param options - How activating a module affects the modules it relates to
   */
  constructor(entries: readonly ModuleEntry[], saved: ActivationMap, options: ModuleStateOptions = {}) {
    this.entries = entries;
    this.#autoRecommended = options.autoRecommended ?? (() => false);
    this.#saved = this.#complete(saved);
    this.#pending = { ...this.#saved };
  }

  /**
   * The activation to save: every module, with the staged changes applied.
   * @returns A plain copy, safe to hand to Foundry
   */
  get activation(): ActivationMap {
    return { ...this.#pending };
  }

  /**
   * Whether a module will be active once the staged changes are saved.
   * @param id - A module ID
   * @returns `true` if the module is, or is staged to become, active
   */
  isActive(id: string): boolean {
    return this.#pending[id] === true;
  }

  /**
   * The modules selected on one side: those the user selected, and the modules they require on that side, following
   * the chain. On the active side, locked modules are never selected.
   * @param side - The side
   * @returns The selected module IDs; reactive, but not to be changed directly
   */
  selected(side: Side): ReadonlySet<string> {
    return side === 'active' ? this.#selectedActive : this.#selectedInactive;
  }

  /**
   * Whether a module is selected on one side.
   * @param side - The side
   * @param id - A module ID
   * @returns `true` if it is selected
   */
  isSelected(side: Side, id: string): boolean {
    return this.selected(side).has(id);
  }

  /**
   * One side's rows for the split view: its modules, with the modules each selected module requires, then those it
   * recommends, grouped under it. On the active side, a recommended module that is still inactive is grouped there
   * too, for the user to confirm.
   * @param side - The side
   * @returns The rows, in display order
   */
  rowsOf(side: Side): readonly ModuleRow[] {
    return side === 'active' ? this.#activeRows : this.#inactiveRows;
  }

  /**
   * Change a side's selection in response to a click on one of its modules. Clicks on a module that is not on that
   * side, or that is locked, are ignored, and a range leaves out locked modules. A module selected only because a
   * selected module requires it cannot be toggled off.
   * @param side - The side clicked
   * @param id - The module clicked
   * @param mode - How the click changes the selection
   */
  select(side: Side, id: string, mode: SelectMode = 'replace'): void {
    const ids = this.#ids(side);
    const index = ids.indexOf(id);
    if (index === -1 || this.isLocked(id)) return;
    const chosen = this.#chosen[side];

    const anchor = this.#anchor[side];
    const anchorIndex = anchor === null ? -1 : ids.indexOf(anchor);
    if (mode === 'range' && anchorIndex !== -1) {
      chosen.clear();
      const [from, to] = anchorIndex < index ? [anchorIndex, index] : [index, anchorIndex];
      for (const rangeId of ids.slice(from, to + 1)) if (!this.isLocked(rangeId)) chosen.add(rangeId);
      return;
    }

    if (mode === 'toggle') {
      if (chosen.has(id)) chosen.delete(id);
      else if (!this.isSelected(side, id)) chosen.add(id);
      else return;
    } else {
      chosen.clear();
      chosen.add(id);
    }
    this.#anchor[side] = id;
  }

  /**
   * Select every module on one side that is not locked. The range anchor is kept, so a later range selection still
   * starts from the last plain or toggled click.
   * @param side - The side
   */
  selectAll(side: Side): void {
    for (const id of this.#ids(side)) if (!this.isLocked(id)) this.#chosen[side].add(id);
  }

  /**
   * Deselect everything on one side.
   * @param side - The side
   */
  clearSelection(side: Side): void {
    this.#chosen[side].clear();
    this.#anchor[side] = null;
  }

  /**
   * Whether a module's details drawer is open.
   * @param id - A module ID
   * @returns `true` if it is open
   */
  isExpanded(id: string): boolean {
    return this.#expanded.has(id);
  }

  /**
   * Open a module's details drawer, or close it if it is open. Any number may be open at once, and opening one leaves
   * the selection alone. Unknown modules are ignored.
   * @param id - A module ID
   */
  toggleExpanded(id: string): void {
    if (!(id in this.#pending)) return;
    if (!this.#expanded.delete(id)) this.#expanded.add(id);
  }

  /**
   * Whether every module's details drawer is open. Never, when no module is installed.
   * @returns `true` if every drawer is open
   */
  get allExpanded(): boolean {
    return this.entries.length > 0 && this.entries.every(({ id }) => this.#expanded.has(id));
  }

  /**
   * Open every module's details drawer, or close them all, leaving the selection alone.
   * @param expanded - `true` to open them, `false` to close them
   */
  setAllExpanded(expanded: boolean): void {
    if (!expanded) this.#expanded.clear();
    else for (const { id } of this.entries) this.#expanded.add(id);
  }

  /**
   * Stage the modules selected on the inactive side to become active. They move to the active side, where they are
   * selected so the move can be seen, and undone with {@link ModuleState.deactivateSelected}.
   * @returns The number of modules moved
   */
  activateSelected(): number {
    return this.#move('inactive', 'active');
  }

  /**
   * Stage the modules selected on the active side to become inactive. They move to the inactive side, where they are
   * selected.
   * @returns The number of modules moved
   */
  deactivateSelected(): number {
    return this.#move('active', 'inactive');
  }

  /**
   * Stage one module to become active or inactive, as the list view's checkboxes do. Activating it activates the
   * modules it requires, following the chain, and those it recommends if `autoRecommended` says so. Deactivating it
   * deactivates the modules activated only for it that no other active module still needs. A module changed here,
   * by the user, is never deactivated for them later. Every module changed is deselected on both sides, since it may
   * move from one to the other. Unknown modules, and attempts to deactivate a locked module, are ignored.
   * @param id - A module ID
   * @param active - Whether the module should be active
   */
  setActive(id: string, active: boolean): void {
    const entry = this.entries.find(each => each.id === id);
    if (entry === undefined || (!active && this.isLocked(id))) return;
    this.#implied.delete(id);
    this.#stage(id, active);
    if (active) this.#activateRelated(entry);
    else this.#releaseImplied();
  }

  /**
   * The active modules that keep a module locked active by requiring it. Modules it needs itself, directly or through
   * a chain, do not count: they require it only in a loop, and deactivating it deactivates those activated for it.
   * @param id - A module ID
   * @returns The modules, in display order; empty if it is not locked
   */
  lockedBy(id: string): readonly ModuleEntry[] {
    if (this.#pending[id] !== true) return [];
    const parents = this.#requiredBy[id] ?? [];
    if (parents.length === 0) return parents;
    const needed = this.#closure(this.entries.filter(entry => entry.id === id));
    return parents.filter(parent => !needed.includes(parent));
  }

  /**
   * Whether a module is locked active because an active module requires it.
   * @param id - A module ID
   * @returns `true` if it cannot be deactivated or selected on the active side
   */
  isLocked(id: string): boolean {
    return this.lockedBy(id).length > 0;
  }

  /**
   * Whether a module was activated only because an active module requires or recommends it.
   * @param id - A module ID
   * @returns `true` if it will be deactivated again once no active module needs it
   */
  isImplied(id: string): boolean {
    return this.#implied.has(id);
  }

  /**
   * Discard the staged changes and both selections.
   */
  reset(): void {
    this.#pending = { ...this.#saved };
    this.#implied.clear();
    this.clearSelection('inactive');
    this.clearSelection('active');
  }

  /**
   * Record that the staged activation has been saved, making it the baseline that later changes are measured from.
   */
  markSaved(): void {
    this.#saved = { ...this.#pending };
    this.#implied.clear();
  }

  /**
   * Stage a module's activation, deselecting it on both sides.
   * @param id - A module ID
   * @param active - Whether it should be active
   */
  #stage(id: string, active: boolean): void {
    this.#pending[id] = active;
    this.#chosen.inactive.delete(id);
    this.#chosen.active.delete(id);
  }

  /**
   * The installed modules a module needs active with it: those it requires and, if `autoRecommended` says so, those
   * it recommends.
   * @param entry - The module
   * @returns The modules it needs
   */
  #needs(entry: ModuleEntry): ModuleEntry[] {
    const { required, recommended } = relatedModules(entry, this.entries);
    return this.#autoRecommended() ? [...required, ...recommended] : required;
  }

  /**
   * The modules some modules need, and the modules those need in turn.
   * @param from - The modules to start from, which are left out unless one of the others needs them
   * @returns The modules needed, in the order found
   */
  #closure(from: readonly ModuleEntry[]): ModuleEntry[] {
    const seen = [...from];
    const found: ModuleEntry[] = [];
    for (let index = 0; index < seen.length; index++) {
      for (const needed of this.#needs(seen[index] as ModuleEntry)) {
        if (!found.includes(needed)) found.push(needed);
        if (!seen.includes(needed)) seen.push(needed);
      }
    }
    return found;
  }

  /**
   * Activate the modules a module needs, and the modules they need in turn, marking those not already active as
   * implied.
   * @param entry - The module activated
   */
  #activateRelated(entry: ModuleEntry): void {
    for (const needed of this.#closure([entry])) {
      if (this.#pending[needed.id] === true) continue;
      this.#stage(needed.id, true);
      this.#implied.add(needed.id);
    }
  }

  /**
   * Deactivate the implied modules no active module needs any more, repeating until none is left, since each one
   * deactivated may have been the last to need another.
   */
  #releaseImplied(): void {
    for (;;) {
      const needed = this.entries
        .filter(({ id }) => this.#pending[id] === true)
        .flatMap(entry => this.#needs(entry))
        .map(({ id }) => id);
      const unneeded = [...this.#implied].filter(id => !needed.includes(id));
      if (unneeded.length === 0) return;
      for (const id of unneeded) {
        this.#implied.delete(id);
        this.#stage(id, false);
      }
    }
  }

  /**
   * Move a side's selected modules to the other side, as checking or unchecking them in the list view would: moving
   * modules to the active side also activates what they need, and moving them to the inactive side deactivates what was
   * activated only for them. The modules moved are selected on their new side.
   * @param from - The side whose selection moves
   * @param to - The side it moves to
   * @returns The number of modules moved
   */
  #move(from: Side, to: Side): number {
    const moving = this.entries.filter(({ id }) => this.selected(from).has(id));
    if (moving.length === 0) return 0;

    if (to === 'active') {
      // The modules selected only because a chosen module requires them are activated for it, as implied modules.
      const chosen = moving.filter(({ id }) => this.#chosen[from].has(id));
      for (const { id } of chosen) {
        this.#implied.delete(id);
        this.#stage(id, true);
      }
      for (const entry of chosen) this.#activateRelated(entry);
    } else {
      for (const { id } of moving) {
        this.#implied.delete(id);
        this.#stage(id, false);
      }
      this.#releaseImplied();
    }
    this.clearSelection(from);
    this.clearSelection(to);
    for (const { id } of moving) this.#chosen[to].add(id);
    return moving.length;
  }

  /**
   * One side's selection: the modules chosen, and the modules they require on that side, leaving out locked modules,
   * such as a module chosen before it was moved and locked.
   * @param side - The side
   * @returns The selected module IDs
   */
  #withRequired(side: Side): ReadonlySet<string> {
    const entries = side === 'active' ? this.active : this.inactive;
    const chosen = [...this.#chosen[side]].filter(id => !this.isLocked(id));
    return new SvelteSet(withRequired(entries, chosen, id => this.isLocked(id)));
  }

  /**
   * The modules on one side, in display order.
   * @param side - The side
   * @returns The modules
   */
  #side(side: Side): ModuleEntry[] {
    return this.entries.filter(({ id }) => (this.#pending[id] === true) === (side === 'active'));
  }

  /**
   * The IDs of the modules on one side, in display order.
   * @param side - The side
   * @returns The module IDs
   */
  #ids(side: Side): string[] {
    return (side === 'active' ? this.active : this.inactive).map(({ id }) => id);
  }

  /**
   * An activation for exactly the known modules, inactive unless `activation` says otherwise.
   * @param activation - A possibly partial activation
   * @returns An activation with an entry for every module
   */
  #complete(activation: ActivationMap): Record<string, boolean> {
    return Object.fromEntries(this.entries.map(({ id }) => [id, activation[id] === true]));
  }
}
