# Copilot Instructions for game_NFT_sui

## Stack and entrypoints

- Vite + React (React Router), TS/JS mix. Routes wired in [src/App.jsx](src/App.jsx) with `/start`, `/editor`, `/game`.
- Main render in [src/main.jsx](src/main.jsx); keep `BrowserRouter` wrapping `<App />`.
- Tailwind v4 style import via `@import "tailwindcss";` in [src/index.css](src/index.css); keep custom wallet button overrides in `.wallet-connect-btn` class.

## Gameplay loop (Kaboom)

- Kaboom initialization lives in [src/game/start.ts](src/game/start.ts); `startGame()` guards against multiple calls with a `started` flag and binds to `<canvas id="game" />` in [src/pages/GamePage.jsx](src/pages/GamePage.jsx). Reuse this API instead of reinitializing Kaboom.
- Map data is loaded from `localStorage` key `CUSTOM_MAP` (grid format). Old `{tiles: {"x,y": value}}` is auto-upgraded; preserve this compatibility when changing storage.
- Tile codes: `1` wall (`#`), `2` trap (`^`), `4` enemy spawn, `5-8` floor variants (`= ~ - _`), `0` empty. `findSpawn()` picks a random floor tile for player spawn; ensure new tiles don't break spawn detection.
- Player uses small hitbox (`Rect` 18x30) with `facing`/`moving`/`attacking` flags; attacks spawn a short-lived hitbox and knockback enemies. Death triggers `respawnPlayer()` back to spawn with brief invincibility.
- Enemies are basic rects with hp and optional patrol; currently spawned wherever grid cell == `4`.

## Map editor

- Simple grid editor in [src/pages/EditorGame.tsx](src/pages/EditorGame.tsx); uses constants `TILE_SIZE=32`, `MAP_W=20`, `MAP_H=12` and the same tile palette as the runtime. Saving writes `{ tileSize, width, height, grid }` to `CUSTOM_MAP`. Loading handles both grid and legacy tiles.
- Navigation to play uses `useNavigate` to `/game`; keep editor and runtime tile semantics aligned.

## Payment / start flow

- Start screen [src/pages/StartGame.tsx](src/pages/StartGame.tsx) calls `POST /api/play/request` with `userId` to decide if play is allowed or needs payment. If `canPlay` true, it should trigger game start (currently `startKaboomGame()` placeholder).
- On invoice required, it renders `<BeepCheckout>` from [src/components/CheckoutWidget.jsx](src/components/CheckoutWidget.jsx) with publishable key `beep_pk_7TPA9_gjAUwiyKOoEhEVU3WoxZPtTDk2`. Success handler polls `GET /api/play/status?userId=...` every 3s until `canPlay`.
- Dev server proxies `/api` to `http://localhost:3001` with request/response logging; adjust proxy in [vite.config.js](vite.config.js) if backend changes.

## Assets and styling

- Sprites live under `public/sprites/{player,goblin,tile}`; Kaboom loads via absolute `/sprites/...` paths. Keep filenames when adding animations so existing loaders work.
- Global styles mostly empty besides Tailwind import; `src/App.css` is unused.

## Commands

- `pnpm dev` (or `npm run dev`) for Vite dev server with proxy.
- `pnpm build` for production build, `pnpm lint` for ESLint.

## Conventions and tips

- Prefer extending existing `startGame()` logic rather than creating new Kaboom instances. Keep the `started` guard intact.
- Maintain `CUSTOM_MAP` schema compatibility; when changing tiles update both editor and runtime mappings.
- Keep API calls under `/api` to benefit from the Vite proxy during local dev.
- React Router v7: use `<Routes>/<Route>`; add new pages in [src/App.jsx](src/App.jsx).

## Open questions to clarify

- What should `startKaboomGame()` in StartGame do (direct route to `/game` or embed Kaboom)?
- Expected backend contract for `/api/play/request` and `/api/play/status` (payload shape, error handling).
