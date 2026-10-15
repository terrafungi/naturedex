# Le Jardin: plant seeds, harvest plants, open boosters

## Context
The user wants the seeds shown in the header (graines, `users.coins`) to be plantable. Plants grow over time and are harvested as a new resource, « plantes », which opens boosters. They want it addictive, intuitive and easy to use.

**Core loop:** plant, then come back, then harvest (with a random bonus), then open a booster, then replant.

**Retention driver:** the longer a plant grows, the better its seed-to-booster rate. That rewards coming back later.

**Existing economy is kept:**
- Paying 100 graines directly still works, so the shop promise "10 boosters dès 1,99 €" stays true.
- The garden is simply the more profitable route.

## Game design

### Booster price in plants
- One booster costs **10 plantes**.
- Paying 100 graines directly is still possible.

### Seeds to plant
Each seed's yield is set so the cost per booster drops as growth time increases:

| Seed | Cost | Time | Yield | ≈ graines / booster |
|---|---|---|---|---|
| Radis éclair | 25 | 3 min | 2 🌿 | 125 (instant fun) |
| Tournesol | 50 | 1 h | 6 🌿 | 83 |
| Chêne | 100 | 8 h | 15 🌿 | 67 |
| Rose de lune | 200 | 24 h | 40 🌿 | 50 |

### Watering
- Each growing plant can be watered **once**.
- Watering cuts the remaining time by 30%.
- It is a quick tap that gives a reason to visit.

### Random harvest bonus (rolled on the server)
- 10% chance of a « Récolte dorée »: yield ×2.
- 1% chance of a « Trésor »: +1 bonus booster (`users.boosters`).

### Plots
- Players start with **3 plots**, expandable to **9**.
- Unlock costs in graines: 300, 600, 1 000, 1 500, 2 500, 4 000.

### Ease of use
- Tap an empty plot to pick a seed.
- Tap a ready plant to harvest it.
- « Tout récolter » harvests every ready plant at once.
- « Replanter » replants the same seed in every empty plot.
- An « Ouvrir un booster (10 🌿) » button opens the booster directly in the garden.

### Visibility
- The navigation gets a « Jardin » entry with a badge counting the ready plants.
- The header wallet shows the plant counter, linking to `/jardin`.

## Implementation

### 1. Schema
Append to `functions/api/schema.sql` under a new marker, then apply with the `sed -n '/^-- Garden/,$p' … | psql` command:
- `ALTER TABLE users ADD COLUMN IF NOT EXISTS plants int NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS plots int NOT NULL DEFAULT 3;`
- New table `garden_plots` with these columns:
  - `user_id` (FK users, ON DELETE CASCADE);
  - `slot` smallint;
  - `kind` text;
  - `planted_at` timestamptz;
  - `ready_at` timestamptz;
  - `watered` bool default false;
  - primary key `(user_id, slot)`.

### 2. API (`functions/api/index.mjs`)

**Constants**
- `SEEDS` table (above).
- `BOOSTER_PLANTS=10`.
- `PLOT_PRICES=[300,600,1000,1500,2500,4000]`, `MAX_PLOTS=9`.
- `WATER_CUT=0.3`, `GOLDEN_CHANCE=0.1`, `TREASURE_CHANCE=0.01`.

**Helper:** `gardenState(db, user)` returns:
- `{ plots, seeds, nextPlotPrice, plants, boosterPlants, now }`;
- `plots` is an array of `{slot, kind, plantedAt, readyAt, watered}` or `null` for each unlocked slot.

**Actions.** Each one runs in a transaction with `SELECT … FOR UPDATE` on the user (same pattern as `openBooster`) and returns `{garden, user: publicUser}`:

| Action | Behaviour |
|---|---|
| `garden` | Read-only state. |
| `plant{slot?, kind}` | Without `slot`, plants every empty plot the player can afford ("Replanter"). Errors: 402 « Pas assez de graines », 409 if the plot is taken. |
| `water{slot}` | `ready_at = now + (ready_at-now)*0.7`, then `watered=true`. Only once per plant, and only if not ready yet. |
| `harvest{slot?}` | Harvests every ready plot (or the one given). Rolls golden and treasure per plot, adds plants and boosters, deletes the rows. Returns `harvest:[{slot, kind, plants, golden, treasure}]`. |
| `unlockPlot` | Debits `PLOT_PRICES[plots-3]` and increments `plots`. |

**Changes to existing code**
- `publicUser` gains `plants`, `boosterPlants` and `plots`.
- `openBooster`: after the bonus booster, add the branch `body.pay === 'plants' && current.plants >= BOOSTER_PLANTS` → `plants = plants - 10`, `paidWith 'plants'`. The coins branch stays (`body.pay === true || 'coins'`).
- `badgeCounts`: `'/jardin'` = number of plots with `ready_at <= now()`.

### 3. Front end
- **`web/src/components/Currency.jsx`:** add a `Plant` icon (Sprout/leaf in a distinct green, e.g. #b5e48c) and extend `Amount` with a `plants` prop.
- **`web/src/components/Layout.jsx`:**
  - `NAV`: add `{ to: '/jardin', label: 'Jardin', Icon: Sprout }` right after Booster.
  - `PRIMARY` becomes 5, so the garden is in the bottom bar. Check at 375 px; if it is too tight, keep 4 and put Jardin in place of Combat.
  - Wallet: add a `/jardin` segment `<Plant/>{short(user.plants)}`.
- **`web/src/main.jsx`:** add the route `/jardin` → `<Private><Garden/></Private>`.
- **New `web/src/pages/Garden.jsx`**
  - Header:
    - plant counter;
    - a 10-segment gauge showing « prochain booster »;
    - a big « Ouvrir un booster » button (`pay:'plants'`) that opens `BoosterOpening` in place, reusing `addCards` and the `BoosterOpening` component.
  - Plot grid (3×3; locked plots show a padlock and the price):
    - soil tiles;
    - an SVG plant that grows in 4 stages (seed → sprout → bush → bloom) according to `(now-planted)/(ready-planted)`, with a gentle sway animation (motion);
    - a ready plant shines and bounces.
  - Interactions:
    - empty plot → `SeedPicker` bottom sheet (same style as `BinderPicker` in `Favorite.jsx`), with 4 seed cards showing cost / time / yield / "meilleur rendement";
    - growing plot → countdown, plus a 💧 water button while not yet watered;
    - ready plot → tap to harvest.
  - Harvest feedback:
    - floating « +6 » plant icons that fly toward the counter;
    - a gold glow and the label « Récolte dorée ×2 ! »;
    - a « Trésor : booster bonus ! » toast.
  - Action bar: « Tout récolter (n) » and « Replanter (seed) ».
  - Timers come from `useCountdown` (exported from `Boosters.jsx`), with a local 1 s ticker for growth stages.
  - Short explanation at the bottom: « Plus une graine pousse longtemps, plus elle rapporte. »
- **`web/src/pages/Boosters.jsx`:**
  - `payWith` order becomes charge → booster → plants (if ≥10) → coins.
  - The button shows « Ouvrir pour 🌿10 ».
  - Add a « Jardin » card that replaces or sits beside the Graines card: « Plante tes graines : jusqu'à 2× plus de boosters » → `/jardin`.

## Verification
1. Apply the schema, deploy the function (`openkbs fn deploy api -s "rate(1 minute)"`), build and run the site with `npx vite --port 5299`.
2. Create a `zz_test_garden` account with a coin balance and test through the API:
   - planting debits graines;
   - harvesting before ready gives nothing;
   - watering shortens the timer once only;
   - to force readiness, run `UPDATE garden_plots SET ready_at=now()` on the test user only, then harvest and check that plants were credited;
   - `openBooster{pay:'plants'}` debits 10;
   - unlocking a plot debits its price; the 402 and 409 errors fire.
3. Screenshots at 375 px and 1280 px of the garden (empty, growing, ready, harvest animation), the header wallet and the bottom bar; then `agent-browser close --all`.
4. Delete the test users, and their user_cards and openings; garden_plots rows cascade.
5. Commit with `feat: jardin — planter des graines pour récolter des plantes`, then deploy the function and the site.
