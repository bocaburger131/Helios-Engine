# Pokégatchi Bag UI State Model + Transition Map

Scope: **Bag UI only** for watch-first + web lane. Event-driven, state-machine aligned with the existing `EventBus` + simulation architecture.

---

## 1) Canonical machine id

- `pg.ui.bag.machine`

---

## 2) Context (machine data)

```ts
interface BagUiContext {
  lane: 'watch' | 'web';
  isOpen: boolean;
  openSource: 'launcher' | 'quick_menu' | 'deep_link' | 'system_resume' | null;

  // inventory snapshot from game domain
  snapshotVersion: number | null;
  items: Record<string, number>; // berries, toys, potions, candy, ...
  capacityUsed: number;
  capacityMax: number;
  capacityState: 'normal' | 'near_full' | 'full';

  // ui selection/use flow
  selectedItemId: string | null;
  selectedQty: number;
  pendingUseRequestId: string | null;

  // loading/error/interruption
  lastErrorCode: string | null;
  interruptionReason: 'modal' | 'route_change' | 'app_background' | 'sync' | null;
  retryCount: number;
}
```

---

## 3) Event catalog (canonical names)

### 3.1 UI-domain events (`pg.ui.bag.*`)

- `pg.ui.bag.open_requested`
- `pg.ui.bag.open_started`
- `pg.ui.bag.opened`
- `pg.ui.bag.close_requested`
- `pg.ui.bag.closed`
- `pg.ui.bag.refresh_requested`
- `pg.ui.bag.selection_changed`
- `pg.ui.bag.use_pressed`
- `pg.ui.bag.confirm_opened`
- `pg.ui.bag.confirm_accepted`
- `pg.ui.bag.confirm_canceled`
- `pg.ui.bag.retry_pressed`
- `pg.ui.bag.interrupted`
- `pg.ui.bag.interruption_cleared`

### 3.2 Game-domain events (`pg.game.item.*`)

- `pg.game.item.inventory_snapshot_requested`
- `pg.game.item.inventory_snapshot_received`
- `pg.game.item.inventory_snapshot_failed`
- `pg.game.item.consume_requested`
- `pg.game.item.consume_applied`
- `pg.game.item.consume_rejected`
- `pg.game.item.capacity_changed`
- `pg.game.item.inventory_invalidated`

---

## 4) State model (exhaustive)

Top-level machine is hierarchical:

```text
pg.ui.bag.closed
pg.ui.bag.opening
pg.ui.bag.open
  ├─ pg.ui.bag.loading
  ├─ pg.ui.bag.ready
  │   ├─ pg.ui.bag.ready.empty
  │   ├─ pg.ui.bag.ready.browsing
  │   ├─ pg.ui.bag.ready.selected
  │   ├─ pg.ui.bag.ready.capacity_near_full
  │   └─ pg.ui.bag.ready.capacity_full
  ├─ pg.ui.bag.confirming_use
  ├─ pg.ui.bag.applying_use
  ├─ pg.ui.bag.refreshing
  ├─ pg.ui.bag.error
  │   ├─ pg.ui.bag.error.load_failed
  │   ├─ pg.ui.bag.error.use_failed
  │   ├─ pg.ui.bag.error.stale_snapshot
  │   └─ pg.ui.bag.error.capacity_mismatch
  └─ pg.ui.bag.interrupted
      ├─ pg.ui.bag.interrupted.by_modal
      ├─ pg.ui.bag.interrupted.by_route_change
      ├─ pg.ui.bag.interrupted.by_app_background
      └─ pg.ui.bag.interrupted.by_sync
pg.ui.bag.closing
```

### Required semantic coverage

- **Normal**: `pg.ui.bag.ready.browsing` / `pg.ui.bag.ready.selected`
- **Loading**: `pg.ui.bag.loading`, `pg.ui.bag.refreshing`
- **Empty**: `pg.ui.bag.ready.empty`
- **Full**: `pg.ui.bag.ready.capacity_full` (and near-full via `capacity_near_full`)
- **Error**: all `pg.ui.bag.error.*`
- **Interruption**: all `pg.ui.bag.interrupted.*`

---

## 5) Guard definitions

- `guard.has_snapshot` → `snapshotVersion !== null`
- `guard.inventory_empty` → `sum(items.values) === 0`
- `guard.item_selected` → `selectedItemId !== null`
- `guard.selected_item_available` → `items[selectedItemId] > 0`
- `guard.requires_confirm` → `lane === 'web' || itemPolicy.requiresConfirm === true`
- `guard.can_quick_use` → `lane === 'watch' && !itemPolicy.requiresConfirm`
- `guard.capacity_full` → `capacityUsed >= capacityMax`
- `guard.capacity_near_full` → `(capacityUsed / capacityMax) >= 0.9 && capacityUsed < capacityMax`
- `guard.consume_matches_pending` → `event.requestId === pendingUseRequestId`
- `guard.retry_available` → `retryCount < 3`

---

## 6) Action catalog (side effects)

### 6.1 UI actions (`pg.ui.bag.*`)

- `pg.ui.bag.set_open_source`
- `pg.ui.bag.animate_open`
- `pg.ui.bag.animate_close`
- `pg.ui.bag.render_list`
- `pg.ui.bag.render_empty`
- `pg.ui.bag.render_capacity_meter`
- `pg.ui.bag.render_error`
- `pg.ui.bag.highlight_selection`
- `pg.ui.bag.clear_selection`
- `pg.ui.bag.show_confirm`
- `pg.ui.bag.hide_confirm`
- `pg.ui.bag.show_toast`
- `pg.ui.bag.lock_inputs`
- `pg.ui.bag.unlock_inputs`
- `pg.ui.bag.mark_interrupted`
- `pg.ui.bag.clear_interruption`
- `pg.ui.bag.emit_opened`
- `pg.ui.bag.emit_closed`

### 6.2 Game actions (`pg.game.item.*`)

- `pg.game.item.inventory_snapshot_requested`
- `pg.game.item.consume_requested`

---

## 7) Transition map (trigger / guards / actions)

| # | From State | Trigger | Guards | Actions | To State |
|---|---|---|---|---|---|
| 1 | `pg.ui.bag.closed` | `pg.ui.bag.open_requested` | — | `pg.ui.bag.set_open_source`, `pg.ui.bag.animate_open`, `pg.ui.bag.lock_inputs`, `pg.ui.bag.open_started` | `pg.ui.bag.opening` |
| 2 | `pg.ui.bag.opening` | `pg.ui.bag.open_started` | — | `pg.game.item.inventory_snapshot_requested` | `pg.ui.bag.loading` |
| 3 | `pg.ui.bag.loading` | `pg.game.item.inventory_snapshot_received` | `guard.inventory_empty` | write snapshot ctx, `pg.ui.bag.render_empty`, `pg.ui.bag.render_capacity_meter`, `pg.ui.bag.unlock_inputs`, `pg.ui.bag.emit_opened` | `pg.ui.bag.ready.empty` |
| 4 | `pg.ui.bag.loading` | `pg.game.item.inventory_snapshot_received` | `guard.capacity_full` | write snapshot ctx, `pg.ui.bag.render_list`, `pg.ui.bag.render_capacity_meter`, `pg.ui.bag.unlock_inputs`, `pg.ui.bag.emit_opened` | `pg.ui.bag.ready.capacity_full` |
| 5 | `pg.ui.bag.loading` | `pg.game.item.inventory_snapshot_received` | `guard.capacity_near_full` | write snapshot ctx, `pg.ui.bag.render_list`, `pg.ui.bag.render_capacity_meter`, `pg.ui.bag.unlock_inputs`, `pg.ui.bag.emit_opened` | `pg.ui.bag.ready.capacity_near_full` |
| 6 | `pg.ui.bag.loading` | `pg.game.item.inventory_snapshot_received` | else | write snapshot ctx, `pg.ui.bag.render_list`, `pg.ui.bag.render_capacity_meter`, `pg.ui.bag.unlock_inputs`, `pg.ui.bag.emit_opened` | `pg.ui.bag.ready.browsing` |
| 7 | `pg.ui.bag.loading` | `pg.game.item.inventory_snapshot_failed` | — | set `lastErrorCode='load_failed'`, increment retry, `pg.ui.bag.render_error`, `pg.ui.bag.unlock_inputs` | `pg.ui.bag.error.load_failed` |
| 8 | any `pg.ui.bag.open.*` | `pg.ui.bag.close_requested` | — | `pg.ui.bag.hide_confirm`, `pg.ui.bag.clear_selection`, `pg.ui.bag.animate_close`, `pg.ui.bag.lock_inputs` | `pg.ui.bag.closing` |
| 9 | `pg.ui.bag.closing` | `pg.ui.bag.closed` | — | clear transient ctx, `pg.ui.bag.unlock_inputs`, `pg.ui.bag.emit_closed` | `pg.ui.bag.closed` |
| 10 | `pg.ui.bag.ready.empty` | `pg.ui.bag.refresh_requested` | — | `pg.ui.bag.lock_inputs`, `pg.game.item.inventory_snapshot_requested` | `pg.ui.bag.refreshing` |
| 11 | `pg.ui.bag.ready.browsing` | `pg.ui.bag.selection_changed` | `guard.item_selected` | set selection, `pg.ui.bag.highlight_selection` | `pg.ui.bag.ready.selected` |
| 12 | `pg.ui.bag.ready.capacity_near_full` | `pg.ui.bag.selection_changed` | `guard.item_selected` | set selection, `pg.ui.bag.highlight_selection` | `pg.ui.bag.ready.selected` |
| 13 | `pg.ui.bag.ready.capacity_full` | `pg.ui.bag.selection_changed` | `guard.item_selected` | set selection, `pg.ui.bag.highlight_selection` | `pg.ui.bag.ready.selected` |
| 14 | `pg.ui.bag.ready.selected` | `pg.ui.bag.selection_changed` | !`guard.item_selected` | `pg.ui.bag.clear_selection` | `pg.ui.bag.ready.browsing` |
| 15 | `pg.ui.bag.ready.selected` | `pg.ui.bag.use_pressed` | !`guard.selected_item_available` | `pg.ui.bag.show_toast`("No item left") | `pg.ui.bag.ready.selected` |
| 16 | `pg.ui.bag.ready.selected` | `pg.ui.bag.use_pressed` | `guard.selected_item_available && guard.requires_confirm` | `pg.ui.bag.show_confirm`, `pg.ui.bag.confirm_opened` | `pg.ui.bag.confirming_use` |
| 17 | `pg.ui.bag.ready.selected` | `pg.ui.bag.use_pressed` | `guard.selected_item_available && guard.can_quick_use` | generate requestId, set `pendingUseRequestId`, `pg.ui.bag.lock_inputs`, `pg.game.item.consume_requested` | `pg.ui.bag.applying_use` |
| 18 | `pg.ui.bag.confirming_use` | `pg.ui.bag.confirm_canceled` | — | `pg.ui.bag.hide_confirm` | `pg.ui.bag.ready.selected` |
| 19 | `pg.ui.bag.confirming_use` | `pg.ui.bag.confirm_accepted` | `guard.selected_item_available` | `pg.ui.bag.hide_confirm`, generate requestId, set `pendingUseRequestId`, `pg.ui.bag.lock_inputs`, `pg.game.item.consume_requested` | `pg.ui.bag.applying_use` |
| 20 | `pg.ui.bag.applying_use` | `pg.game.item.consume_applied` | `guard.consume_matches_pending` | clear pending, patch local item count/capacity, `pg.ui.bag.unlock_inputs`, `pg.ui.bag.show_toast`("Used item") | `pg.ui.bag.refreshing` |
| 21 | `pg.ui.bag.applying_use` | `pg.game.item.consume_rejected` | `guard.consume_matches_pending` | clear pending, set `lastErrorCode='use_failed'`, `pg.ui.bag.unlock_inputs`, `pg.ui.bag.render_error` | `pg.ui.bag.error.use_failed` |
| 22 | `pg.ui.bag.refreshing` | `pg.game.item.inventory_snapshot_received` | `guard.inventory_empty` | write snapshot ctx, `pg.ui.bag.render_empty`, `pg.ui.bag.render_capacity_meter`, `pg.ui.bag.unlock_inputs` | `pg.ui.bag.ready.empty` |
| 23 | `pg.ui.bag.refreshing` | `pg.game.item.inventory_snapshot_received` | `guard.capacity_full` | write snapshot ctx, `pg.ui.bag.render_list`, `pg.ui.bag.render_capacity_meter`, `pg.ui.bag.unlock_inputs` | `pg.ui.bag.ready.capacity_full` |
| 24 | `pg.ui.bag.refreshing` | `pg.game.item.inventory_snapshot_received` | `guard.capacity_near_full` | write snapshot ctx, `pg.ui.bag.render_list`, `pg.ui.bag.render_capacity_meter`, `pg.ui.bag.unlock_inputs` | `pg.ui.bag.ready.capacity_near_full` |
| 25 | `pg.ui.bag.refreshing` | `pg.game.item.inventory_snapshot_received` | else | write snapshot ctx, `pg.ui.bag.render_list`, `pg.ui.bag.render_capacity_meter`, `pg.ui.bag.unlock_inputs` | `pg.ui.bag.ready.browsing` |
| 26 | `pg.ui.bag.refreshing` | `pg.game.item.inventory_snapshot_failed` | — | set `lastErrorCode='stale_snapshot'`, `pg.ui.bag.render_error`, `pg.ui.bag.unlock_inputs` | `pg.ui.bag.error.stale_snapshot` |
| 27 | any `pg.ui.bag.open.*` | `pg.game.item.capacity_changed` | `guard.capacity_full` | update capacity ctx, `pg.ui.bag.render_capacity_meter`, `pg.ui.bag.show_toast`("Bag full") | `pg.ui.bag.ready.capacity_full` |
| 28 | any `pg.ui.bag.open.*` | `pg.game.item.capacity_changed` | `guard.capacity_near_full` | update capacity ctx, `pg.ui.bag.render_capacity_meter` | `pg.ui.bag.ready.capacity_near_full` |
| 29 | any `pg.ui.bag.open.*` | `pg.game.item.capacity_changed` | else | update capacity ctx, `pg.ui.bag.render_capacity_meter` | `pg.ui.bag.ready.browsing` |
| 30 | any `pg.ui.bag.open.*` | `pg.game.item.inventory_invalidated` | — | `pg.ui.bag.lock_inputs`, `pg.game.item.inventory_snapshot_requested` | `pg.ui.bag.refreshing` |
| 31 | any `pg.ui.bag.open.*` | `pg.ui.bag.interrupted` (`reason=modal`) | — | `pg.ui.bag.mark_interrupted`, `pg.ui.bag.hide_confirm`, `pg.ui.bag.lock_inputs` | `pg.ui.bag.interrupted.by_modal` |
| 32 | any `pg.ui.bag.open.*` | `pg.ui.bag.interrupted` (`reason=route_change`) | — | `pg.ui.bag.mark_interrupted`, `pg.ui.bag.hide_confirm`, `pg.ui.bag.lock_inputs` | `pg.ui.bag.interrupted.by_route_change` |
| 33 | any `pg.ui.bag.open.*` | `pg.ui.bag.interrupted` (`reason=app_background`) | — | `pg.ui.bag.mark_interrupted`, `pg.ui.bag.hide_confirm`, `pg.ui.bag.lock_inputs` | `pg.ui.bag.interrupted.by_app_background` |
| 34 | any `pg.ui.bag.open.*` | `pg.ui.bag.interrupted` (`reason=sync`) | — | `pg.ui.bag.mark_interrupted`, `pg.ui.bag.hide_confirm`, `pg.ui.bag.lock_inputs` | `pg.ui.bag.interrupted.by_sync` |
| 35 | `pg.ui.bag.interrupted.*` | `pg.ui.bag.interruption_cleared` | — | `pg.ui.bag.clear_interruption`, `pg.game.item.inventory_snapshot_requested` | `pg.ui.bag.refreshing` |
| 36 | `pg.ui.bag.error.load_failed` | `pg.ui.bag.retry_pressed` | `guard.retry_available` | `pg.ui.bag.lock_inputs`, `pg.game.item.inventory_snapshot_requested` | `pg.ui.bag.loading` |
| 37 | `pg.ui.bag.error.use_failed` | `pg.ui.bag.retry_pressed` | `guard.retry_available && guard.item_selected` | generate requestId, set pending, `pg.ui.bag.lock_inputs`, `pg.game.item.consume_requested` | `pg.ui.bag.applying_use` |
| 38 | `pg.ui.bag.error.stale_snapshot` | `pg.ui.bag.retry_pressed` | `guard.retry_available` | `pg.ui.bag.lock_inputs`, `pg.game.item.inventory_snapshot_requested` | `pg.ui.bag.refreshing` |
| 39 | `pg.ui.bag.error.capacity_mismatch` | `pg.ui.bag.retry_pressed` | `guard.retry_available` | `pg.ui.bag.lock_inputs`, `pg.game.item.inventory_snapshot_requested` | `pg.ui.bag.refreshing` |
| 40 | any `pg.ui.bag.error.*` | `pg.ui.bag.close_requested` | — | `pg.ui.bag.animate_close` | `pg.ui.bag.closing` |

---

## 8) Watch-first vs Web lane behavior (same machine, lane-based guards)

- **Watch lane**
  - Default path: `ready.selected -> applying_use` via `guard.can_quick_use`.
  - Confirmation is skipped for low-risk consumables.
  - Compact interruption handling prioritized (modal/sync resumes through `refreshing`).

- **Web lane**
  - Default path: `ready.selected -> confirming_use -> applying_use`.
  - Always confirm unless policy whitelists quick-use.
  - Richer error pane can expose details from `lastErrorCode`.

---

## 9) Runtime invariants (must hold)

1. Only one pending consume request at a time (`pendingUseRequestId` nullable singleton).
2. `pg.game.item.consume_applied/rejected` must match pending requestId before mutating UI state.
3. Any external inventory invalidation forces `refreshing` before next use.
4. `close_requested` is globally valid from any open/error/interrupted child state.
5. `interrupted.*` never consumes items; it only suspends and resumes through refresh.

---

## 10) Minimal implementation hooks in current architecture

- Emit UI intents from Bag component to `EventBus` using `pg.ui.bag.*`.
- Bridge `pg.game.item.*` events from `SimulationEngine` / inventory service.
- Keep this machine authoritative for bag panel rendering state; game domain stays authoritative for item counts.
- Persist only gameplay inventory; do **not** persist transient UI states (`confirming_use`, `applying_use`, `interrupted.*`).
