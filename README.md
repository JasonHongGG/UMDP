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
