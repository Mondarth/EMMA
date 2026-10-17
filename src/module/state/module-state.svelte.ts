import { SvelteSet } from 'svelte/reactivity';

import type { ActivationMap, ModuleEntry } from '@module/adapters/modules';

/** The two lists of the split view: modules that are inactive, and modules that are active. */
export type Side = 'inactive' | 'active';

/**
 * How a click changes a side's selection: `replace` selects only the clicked module (a plain click), `toggle` adds or
 * removes it (Ctrl/Cmd-click), and `range` selects every module from the last plain or toggled click to it
 * (Shift-click).
 */
export type SelectMode = 'replace' | 'toggle' | 'range';

/**
 * The state behind EMMA's views: the installed modules, which of them the world has saved as active, the changes
 * staged on top of that, and what is selected on each side of the split view.
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
  readonly #selection: Record<Side, SvelteSet<string>> = { inactive: new SvelteSet(), active: new SvelteSet() };
  /** Where each side's next range selection starts. */
  readonly #anchor: Record<Side, string | null> = { inactive: null, active: null };

  /** The modules that will be inactive once the staged changes are saved, in display order. */
  readonly inactive: readonly ModuleEntry[] = $derived.by(() => this.#side('inactive'));

  /** The modules that will be active once the staged changes are saved, in display order. */
  readonly active: readonly ModuleEntry[] = $derived.by(() => this.#side('active'));

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
   * @param entries - The installed modules, in display order
   * @param saved - Which modules the world has saved as active; modules missing from it are inactive
   */
  constructor(entries: readonly ModuleEntry[], saved: ActivationMap) {
    this.entries = entries;
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
   * The modules selected on one side.
   * @param side - The side
   * @returns The selected module IDs; reactive, but not to be changed directly
   */
  selected(side: Side): ReadonlySet<string> {
    return this.#selection[side];
  }

  /**
   * Whether a module is selected on one side.
   * @param side - The side
   * @param id - A module ID
   * @returns `true` if it is selected
   */
  isSelected(side: Side, id: string): boolean {
    return this.#selection[side].has(id);
  }

  /**
   * Change a side's selection in response to a click on one of its modules. Clicks on a module that is not on that
   * side are ignored.
   * @param side - The side clicked
   * @param id - The module clicked
   * @param mode - How the click changes the selection
   */
  select(side: Side, id: string, mode: SelectMode = 'replace'): void {
    const ids = this.#ids(side);
    const index = ids.indexOf(id);
    if (index === -1) return;
    const selection = this.#selection[side];

    const anchor = this.#anchor[side];
    const anchorIndex = anchor === null ? -1 : ids.indexOf(anchor);
    if (mode === 'range' && anchorIndex !== -1) {
      selection.clear();
      const [from, to] = anchorIndex < index ? [anchorIndex, index] : [index, anchorIndex];
      for (const rangeId of ids.slice(from, to + 1)) selection.add(rangeId);
      return;
    }

    if (mode === 'toggle') {
      if (!selection.delete(id)) selection.add(id);
    } else {
      selection.clear();
      selection.add(id);
    }
    this.#anchor[side] = id;
  }

  /**
   * Select every module on one side. The range anchor is kept, so a later range selection still starts from the last
   * plain or toggled click.
   * @param side - The side
   */
  selectAll(side: Side): void {
    for (const id of this.#ids(side)) this.#selection[side].add(id);
  }

  /**
   * Deselect everything on one side.
   * @param side - The side
   */
  clearSelection(side: Side): void {
    this.#selection[side].clear();
    this.#anchor[side] = null;
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
   * Stage one module to become active or inactive, as the list view's checkboxes do. The module is deselected on both
   * sides, since it may move from one to the other. Unknown modules are ignored.
   * @param id - A module ID
   * @param active - Whether the module should be active
   */
  setActive(id: string, active: boolean): void {
    if (!(id in this.#pending)) return;
    this.#pending[id] = active;
    this.#selection.inactive.delete(id);
    this.#selection.active.delete(id);
  }

  /**
   * Discard the staged changes and both selections.
   */
  reset(): void {
    this.#pending = { ...this.#saved };
    this.clearSelection('inactive');
    this.clearSelection('active');
  }

  /**
   * Record that the staged activation has been saved, making it the baseline that later changes are measured from.
   */
  markSaved(): void {
    this.#saved = { ...this.#pending };
  }

  /**
   * Move a side's selected modules to the other side.
   * @param from - The side whose selection moves
   * @param to - The side it moves to
   * @returns The number of modules moved
   */
  #move(from: Side, to: Side): number {
    const moving = this.#ids(from).filter(id => this.#selection[from].has(id));
    if (moving.length === 0) return 0;

    for (const id of moving) this.#pending[id] = to === 'active';
    this.clearSelection(from);
    this.clearSelection(to);
    for (const id of moving) this.#selection[to].add(id);
    return moving.length;
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
