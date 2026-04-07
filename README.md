# Unity Mono Studio

## Architecture Docs

- Overall hard-cut architecture: [docs/architecture/overall-hard-cut.md](docs/architecture/overall-hard-cut.md)
- Scene resource hard cut: [docs/architecture/scene-resource-hard-cut.md](docs/architecture/scene-resource-hard-cut.md)

## Diagnostics Configuration

Diagnostics can now be configured from a single root `.env` file. Frontend Vite diagnostics and backend Rust diagnostics both read the same `UNITY_MONO_STUDIO_DEBUG_DIAGNOSTICS*` variables, so you do not need to export shell variables or use DevTools overrides for normal setup.

Start by copying `.env.example` to `.env`, or edit the checked-in local `.env` in this workspace.

Available variables:

- `UNITY_MONO_STUDIO_DEBUG_DIAGNOSTICS`: enable or disable diagnostics globally.
- `UNITY_MONO_STUDIO_DEBUG_DIAGNOSTICS_LEVEL`: `debug`, `info`, `warn`, or `error`.
- `UNITY_MONO_STUDIO_DEBUG_DIAGNOSTICS_CHANNELS`: optional comma-separated filter such as `studio,scene,tauri`.
- `UNITY_MONO_STUDIO_DEBUG_DIAGNOSTICS_ORIGINS`: optional comma-separated filter such as `useStudioRuntimeState,scene_commands`.
- `UNITY_MONO_STUDIO_DEBUG_DIAGNOSTICS_CONSOLE`: frontend console sink toggle when diagnostics are enabled.
- `UNITY_MONO_STUDIO_DEBUG_DIAGNOSTICS_BUFFER`: frontend in-memory diagnostics buffer toggle when diagnostics are enabled.
- `UNITY_MONO_STUDIO_DEBUG_DIAGNOSTICS_MAX_BUFFER`: frontend diagnostics buffer size.

## Scripts

- `npm run generate:contracts`: regenerate canonical contract artifacts for TypeScript and Rust.
- `npm run check:contracts`: fail when generated contract artifacts drift from the canonical source.
- `npm run dev`: start the Vite frontend in development mode.
- `npm run tauri dev`: run the desktop app through Tauri.
- `npm run build`: type-check and create a production build.
- `npm run test`: start the Vitest watcher.
- `npm run test:run`: execute the Studio unit test suite once.

## Studio Validation

The Studio workflow core is covered by unit tests for:

- JSON envelope and port contracts
- class catalog and binding helpers
- graph reducer behavior
- workflow persistence parsing and storage

## For Loop Node

Studio now includes a count-based `For Loop` control node for repeating a loop body a fixed number of times.

### Configuration

- `Loop Count` accepts either a literal integer or an input expression.
- `0` is treated as a valid value and routes directly to `done-out`.
- Invalid values such as negative numbers, decimals, or unresolved non-numeric expressions stop execution with a validation error.

### Wiring

- `flow-in`: enter the loop for the first time or re-enter it after one loop body pass.
- `loop-out`: connect this to the first control node in the loop body.
- `done-out`: connect this to the node that should run after the loop completes.
- `iteration-out`: optional data output that exposes the current iteration payload to downstream expressions.

To continue looping, the last control node inside the loop body must explicitly reconnect back to `flow-in`.

### Iteration Payload

`iteration-out` emits a JSON payload with the following shape:

```json
{
	"index": 0,
	"totalCount": 3,
	"isFirstIteration": true,
	"isLastIteration": false
}
```

This node currently supports count-based iteration only. Array or collection iteration should be implemented as a separate node rather than extending this one.
