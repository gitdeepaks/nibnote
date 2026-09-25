# Nibnote — iPad notes app

Current phase: **Phase 0** (see docs/BUILD_PLAN.md → "Phase 0")
Before any work, read the current phase section and the
"Type-safety contract" and "Security" sections of docs/BUILD_PLAN.md.

## Hard rules
- Never write `any` or `unknown`; no `as` casts (except `as const`), no `!`, no `@ts-ignore`
- Every external value goes through a Zod schema on the same line
- Never touch code outside the current phase; new ideas go to the Parking lot
- Plan first; no code until I approve
- Bun for packages and scripts; Node only for Expo CLI

## When a phase ends
Tick its exit criteria in docs/BUILD_PLAN.md and update "Current phase" above.

## Folder map
- `apps/ipad` — Expo SDK 58 app (dev client, iPad only). Routes in `src/app/`; native modules in `modules/`
- `apps/server` — Hono API on Bun; exports `AppType` for the Hono RPC client (`import type` only)
- `packages/shared` — the only home for Zod schemas, branded IDs, `Result`, `assertNever`
- `packages/config` — tsconfig base, ESLint contract rules, lint-contract test, Claude hook script
- `.github/workflows/ci.yml` — typecheck, lint, test (Ubuntu) + SwiftLint/XCTest (macOS)

## Commands
- `bun run typecheck` / `bun run lint` / `bun run test` — every package, from the root
- `bun run --filter @nibnote/<pkg> <script>` — one package
- `cd apps/ipad && bunx expo install <pkg>` — add Expo/RN deps (SDK-matched versions)
- `cd apps/ipad && bunx expo run:ios --device` — dev build to the iPad
