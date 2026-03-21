# Unity Mono Studio

## Scripts

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
