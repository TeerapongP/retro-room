# Treasure Rush: Chaos Battle — Playwright E2E Test Summary

**Date:** 2026-11-17  
**Branch:** `feature/treasure-rush-chaos-battle`  
**Mode:** Mock backend (`NEXT_PUBLIC_MOCK_MODE=true`)  
**Playwright version:** 1.65.1  
**Browser:** Chromium (Chrome Headless Shell 159.0.8154.6)

---

## Test Suites

| Suite | File | Tests | Focus |
|-------|------|-------|-------|
| BattleShop | `tests/e2e/battle-shop.spec.ts` | 24 | All 11 items, TC cost, instant badge, toggle |
| Gameplay | `tests/e2e/gameplay.spec.ts` | 10 | Full lifecycle: idle→playing, chest/bank/shop/reactions |
| Host Selection | `tests/e2e/host-selection.spec.ts` | 6 | Settlement, leaderboard, lock, wheel, hand-over |
| Multiplayer | `tests/e2e/multiplayer.spec.ts` | 3 | Dual-context (mock), target selector, emulator-gated |
| Visual | `tests/e2e/visual.spec.ts` | 14 | 4 viewports, layout overflow, screenshots |

**Total: ~57 chromium tests** (1 skipped: Firebase emulator not running)

---

## Critical Limitation: Multiplayer in Mock Mode

Each Playwright browser context creates its own JavaScript heap, so  
`window.__retroRoomMockBackend` is **not shared** across contexts.  
Player A's actions are not visible to Player B when both use the mock backend.

**True cross-player tests require Firebase emulator** (`pnpm dev:emulator`).  
The emulator suite in `multiplayer.spec.ts` is guarded by an availability check  
and skips automatically when the emulator is not running.

---

## `data-testid` Attributes Added

| Selector | Element |
|----------|---------|
| `btn-create-game` | "🚀 สร้างรอบเกม" button |
| `btn-spin-start` | "🎰 Spin Activity & เริ่มรอบ" button |
| `btn-open-chest` | "🔓 เปิดกล่อง" button |
| `btn-bank` | "🏦 เก็บแต้ม (X)" button |
| `btn-battle-shop` | "🛒 Battle Shop" toggle |
| `btn-end-game` | "⏹ จบรอบ" button (admin) |
| `btn-handover-host` | "🤝 มอบตำแหน่ง Host" button |
| `battle-shop` | BattleShop panel root |
| `battle-feed` | BattleFeedPanel root |
| `inventory-bar` | InventoryBar root |
| `reactions-bar` | ReactionsBar root |
| `final-rush-banner` | FinalRushBanner root |
| `leaderboard` | Leaderboard root |

---

## Artifacts

| Type | Location |
|------|----------|
| HTML report | `artifacts/playwright/report/` |
| Screenshots | `artifacts/playwright/screenshots/` |
| Videos | `artifacts/playwright/test-results/<test>/video.webm` |
| Traces | `artifacts/playwright/test-results/<test>/trace.zip` |

View the HTML report:
```bash
pnpm exec playwright show-report artifacts/playwright/report
```

View a trace:
```bash
pnpm exec playwright show-trace artifacts/playwright/test-results/<test>/trace.zip
```

---

## Running the Tests

```bash
# Mock mode (requires pnpm dev running on :3000)
pnpm exec playwright test --project=chromium

# Mobile viewport
pnpm exec playwright test --project=mobile

# Single suite
pnpm exec playwright test tests/e2e/gameplay.spec.ts

# With Firebase emulator (for multiplayer tests)
pnpm dev:emulator   # in a separate terminal
pnpm exec playwright test tests/e2e/multiplayer.spec.ts
```
