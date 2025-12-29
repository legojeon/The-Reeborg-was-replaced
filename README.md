Reeborg 3D — Project Structure (MVP scaffold)

This repository scaffolds a modular, extensible 3D version of Reeborg’s World using Vite, React, TypeScript, three.js, and Pyodide.

Focus is on clean separation of concerns:
- `core/world`: world state & helpers (pure data/logic)
- `core/engine`: action queue, rules, execution, trace events
- `core/renderer`: three.js scene + world sync (no game logic)
- `core/py`: Pyodide bridge (Python enqueues actions only)
- `ui`: React components and layout only

Next steps (not implemented in this scaffold):
- Initialize Vite + React + TS
- Implement types, engine, renderer, Pyodide bridge, and UI


