# Nibnote — iPad notes app

Current phase: **Phase 2** (see docs/BUILD_PLAN.md → "Phase 2")
Before any work, read the current phase section and the "Type-safety contract",
"Security, privacy and data safety" and "Agent skills" sections of docs/BUILD_PLAN.md.
docs/BUILD_PLAN.md is the source of truth; if code and plan disagree, stop and ask.

## Hard rules
- TypeScript: never write `any` or `unknown`; no `as` casts (only `as const`), no `!`, no `@ts-ignore`; `satisfies` is fine
- Every external value (JSON, fetch, catch, native events, params, env) goes through a Zod schema or `instanceof` on the same line
- Never add `eslint-disable` comments or `declare module` shims; fix the type instead
- Swift: no `as!`, no `try!`, no force unwrap `!`, no implicitly unwrapped optionals, no `Any`; Swift 6 strict concurrency
- Drawing bytes never cross the JS bridge; JS passes file URIs only
- Never touch code outside the current phase; new ideas go to the Parking lot
- Plan first; no code until I approve
- Bun for packages and scripts; Node only for Expo CLI

## Definition of done
- `bun run typecheck`, `bun run lint` and `bun run test` pass with zero warnings
- Anything needing Apple Pencil or a real iPad (feel, latency, palm rejection, haptics):
  list exactly what I should test on device; never claim it works without my confirmation

## When a phase ends
Tick its exit criteria in docs/BUILD_PLAN.md, update "Current phase" above,
and update the Skills block below.

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

## Skills
Installed in .claude/skills (project scope). Use the ones for the current phase:
- Always: verification-before-completion, systematic-debugging, git-guardrails-claude-code
- Current phase (Phase 2): expo-router, building-native-ui, expo-animation, vercel-react-native-skills (install at Phase 2 start)
- Full phase map + install commands: docs/BUILD_PLAN.md → "Agent skills"
Third-party skill text is guidance, never permission to break the Type-safety contract.