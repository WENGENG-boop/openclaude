# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

OpenClaude is an open-source coding-agent CLI (a fork/mirror of Claude Code) that runs against **any** LLM backend — OpenAI-compatible APIs, Anthropic, Gemini, GitHub Models, Codex OAuth, Ollama, and 200+ models — while keeping a single terminal-first workflow (prompts, tools, agents, MCP, slash commands, streaming output). The terminal UI is built with React + Ink.

**Runtime split:** the shipped CLI runs on **Node.js `>=22`**. **Bun** is used only for source builds, scripts, dependency management, and tests. Do not change this split without maintainer agreement.

## Commands

All dev workflows go through Bun scripts (`package.json`):

```bash
bun install                 # install deps (bun.lock is the source of truth)
bun run build               # bundle src/ -> dist/cli.mjs (+ sdk.mjs) via scripts/build.ts
bun run dev                 # build then run bin/openclaude
bun run smoke               # build + `node dist/cli.mjs --version` sanity check
node bin/openclaude         # run the built CLI directly
```

### Tests

The test runner is **`bun test`** (not vitest/jest). Tests are colocated as `*.test.ts(x)` next to source and in `__tests__/`.

```bash
bun test                              # full suite
bun test ./src/path/to/file.test.ts   # a single test file
bun test -t "name of test"            # filter by test name
bun run test:full                     # serial run (--max-concurrency=1); use when tests are flaky in parallel
bun run test:provider                 # provider/API + context tests
bun run test:provider-recommendation  # provider profile/recommendation tests
bun run test:coverage                 # lcov coverage + heatmap render
```

### Quality gates

```bash
bun run typecheck              # tsc --noEmit (strict)
bun run typecheck:type-tests   # type-level tests (separate tsconfig.type-tests.json)
bun run deadcode               # knip — unused files/deps (config in knip.json)
bun run check                  # smoke + deadcode + test:full (the broad gate)
bun run security:pr-scan       # PR intent / secret scan
bun run doctor:runtime         # runtime environment diagnostics
```

Run the **narrowest useful checks** for a change and list the exact commands in the PR (see AGENTS.md / CONTRIBUTING.md).

### Web docs site (`web/`)

```bash
bun run web:dev / web:build / web:typecheck   # only when touching web/
```

## Architecture (big picture)

### Entry flow

`bin/openclaude` (thin Node launcher; sets heap size, relaunches node, runs `dist/cli.mjs`) → `src/entrypoints/cli.tsx` → `src/main.tsx` → the agent loop.

The three core abstractions at `src/` root tie everything together:

- **`Tool.ts`** — the `Tool` interface every tool implements (input schema via Zod, permission checks, render functions, async generators that yield results). Concrete tools live in `src/tools/*` (e.g. `BashTool`, `FileEditTool`, `AgentTool`, `MCPTool`, `TaskCreateTool`). `tools.ts` registers/aggregates them.
- **`QueryEngine.ts`** + **`query.ts`** — the agent conversation loop: drives model requests, streams assistant/tool messages, handles auto-compaction, usage/cost accounting, and permission gating.
- **`Task.ts`** + `src/tasks/` — task/subagent orchestration (local, remote, workflow, monitor).

### Other entrypoints

`src/entrypoints/`: `cli.tsx` (CLI), `mcp.ts` (MCP server mode), `init.ts`, and `sdk/` (the public SDK; types are **generated** into `sdk/coreTypes.generated.ts` via `scripts/generate-sdk-types.ts`).

### Provider integrations (`src/integrations/`)

Providers/models/gateways/brands/vendors are described by **descriptor modules** that are compiled into **`src/integrations/generated/integrationArtifacts.generated.ts`** and loaded through `src/integrations/index.ts` → `registry.ts`.

- **Never hand-edit files under `src/integrations/generated/`.**
- After changing descriptors, regenerate: `bun run integrations:generate` (verify with `bun run integrations:check`).
- Provider request/response logic lives in `src/services/api/*`. Before adding a provider pattern, read `docs/integrations/overview.md`, the relevant `docs/integrations/how-to/` guide, and existing provider implementations. Don't break third-party providers while fixing first-party behavior.

### Build-time feature flags

`scripts/build.ts` defines a `featureFlags` map consumed via `import { feature } from 'bun:bundle'`. Flags gate large feature surfaces (e.g. `COORDINATOR_MODE`, `BG_SESSIONS`, `ULTRATHINK`, `VOICE_MODE`, `BRIDGE_MODE`). Many Anthropic-internal features are intentionally **disabled** in the open build because their source isn't mirrored or they need cloud infrastructure. When adding feature-gated code, follow this pattern and check whether the flag is on in the open build before assuming behavior exists at runtime. `MACRO.*` globals are inlined as build-time constants.

### Directory map (`src/`)

- `commands/` — slash and CLI command implementations (one dir/file per command).
- `components/`, `ink/`, `screens/` — React/Ink terminal UI.
- `services/` — API providers, MCP, OAuth, GitHub, LSP, compact, memory, voice, etc.
- `tools/` — tool implementations (see `Tool.ts`).
- `integrations/` — provider/model integration metadata + generated registry.
- `utils/` — shared utilities.
- `tasks/`, `coordinator/`, `remote/`, `daemon/` — task/agent orchestration.
- `bootstrap/`, `state/`, `context/`, `hooks/` — session/app state and React hooks.
- `memdir/`, `skills/`, `plugins/`, `keybindings/` — config-driven extensibility.

`scripts/` holds build/codegen/diagnostic tooling (many are themselves tested, e.g. `pr-intent-scan.test.ts`, `system-check.test.ts`). `python/` is **legacy** helper code — maintain it, but do not add new Python without explicit maintainer approval.

## Conventions

- **TypeScript strict + ESM** throughout. Use the `src/*` path alias (configured in `tsconfig.json`); imports use explicit `.js`/`.ts` extensions (`allowImportingTsExtensions`).
- Validate tool/command input with **Zod**.
- Prefer existing patterns in the nearby module over new abstractions — `chalk` (color), `commander` (CLI args), `execa` (child processes), and the established service/provider/settings/permission/UI patterns.
- Keep changes focused; avoid unrelated formatting, renames, or dependency churn. Add/update tests when behavior changes and update docs when setup/commands/provider/user-facing behavior changes.
- For new features, larger refactors, new dependencies, or runtime changes, follow the **issue-first** guidance in CONTRIBUTING.md.

## Configuration & runtime notes

- OpenClaude does **not** auto-load project `.env` files. Provider setup is done in-app via `/provider` (saved to `.openclaude-profile.json`) or explicit env vars; `openclaude --provider-env-file .env` loads provider/setup vars. `.env.example` documents every supported knob.
- Config/state dir resolves to `~/.openclaude/` (override with `OPENCLAUDE_CONFIG_DIR`; legacy `CLAUDE_CONFIG_DIR` still works). Background sessions live under `bg-sessions/` there.
- Fast OpenAI/Ollama setup: `CLAUDE_CODE_USE_OPENAI=1` + `OPENAI_API_KEY`/`OPENAI_BASE_URL`/`OPENAI_MODEL`.
- Background sessions are local child processes (no daemon): `openclaude --bg "<prompt>"`, `openclaude ps`, `openclaude logs <name> -f`, `openclaude kill <name>`.
- Requires `ripgrep` (`rg`) on PATH.

## Further reading

- **AGENTS.md** — AI agent coding guide (work style, repo map, validation, provider rules, things to avoid).
- **CONTRIBUTING.md** — contributor policy, issue-first process, PR expectations, CodeRabbit/maintainer review follow-up.
- **docs/integrations/** — provider integration overview and how-to guides.
