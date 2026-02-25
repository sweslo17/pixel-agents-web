# Pixel Agents Web — Compressed Reference

Standalone web app (Fastify server + React SPA): pixel art office where AI agents (Claude Code sessions) are animated characters. Monorepo with npm workspaces: `shared/`, `server/`, `client/`.

## Architecture

```
shared/src/                     — Shared types and constants
  types.ts                      — AgentState, RoomSummary, AgentSnapshot, SeatMeta
  protocol.ts                   — ClientMessage, LobbyMessage, RoomMessage, GlobalMessage, ServerMessage
  constants.ts                  — All shared constants (timing, parsing, layout, server, lobby)
  transport.ts                  — MessageSink interface

server/src/                     — Fastify HTTP + WebSocket server (Node.js)
  index.ts                      — Entry: Fastify setup, scanner callbacks, WS/HTTP routes
  core/
    sessionScanner.ts           — Periodic scan of ~/.claude/projects/ for active JSONL sessions
    projectManager.ts           — ProjectState lifecycle, agent add/remove, snapshots
    displayNames.ts             — Smart display name computation from project paths
  claude/
    fileWatcher.ts              — fs.watch + polling, readNewLines, partial line buffering
    transcriptParser.ts         — JSONL parsing: tool_use/tool_result → ServerMessage
    timerManager.ts             — Waiting/permission timer logic
  ws/
    wsBroadcaster.ts            — Client tracking, broadcastLobby/Room/All, room sinks
    wsRouter.ts                 — WS message handler: joinRoom, leaveRoom, saveLayout, saveAgentSeats
  routes/
    assets.ts                   — HTTP endpoints: /api/assets/{characters,floors,walls,furniture}
    health.ts                   — GET /api/health
  assets/
    assetLoader.ts              — PNG → SpriteData, character/floor/wall/furniture loading
  persistence/
    layoutPersistence.ts        — Per-project layout file I/O (~/.pixel-agents/layouts/<hash>.json)

client/src/                     — React SPA (Vite)
  main.tsx                      — Entry: connect WS, render App
  index.css                     — Global styles, pixel font @font-face, CSS variables (--pixel-*)
  App.tsx                       — Router: lobby vs room, connection status, NewRoomToast
  RoomView.tsx                  — Composition root for room: hooks + OfficeCanvas + overlays
  wsClient.ts                   — WS singleton: connect, send, onMessage, message buffering
  assetFetcher.ts               — HTTP fetch for sprite assets
  constants.ts                  — Game constants (grid, animation, rendering, camera, zoom, editor, sound)
  notificationSound.ts          — Web Audio API chime on agent turn completion
  fonts/                        — FS Pixel Sans Unicode font file
  hooks/
    useWebSocket.ts             — Room-level WS handler, agent state, asset loading, AgentIdMapper
    useLobby.ts                 — Lobby-level WS handler, room list state
    useConnectionStatus.ts      — WS connection status hook
    useEditorActions.ts         — Editor state + callbacks
    useEditorKeyboard.ts        — Keyboard shortcut effect
  lobby/
    LobbyCanvas.tsx             — Canvas component for lobby scene
    lobbyRenderer.ts            — Lobby rendering: room cards, characters, title
    lobbyState.ts               — Lobby game state management
  components/
    BottomToolbar.tsx            — Lobby, Layout toggle, Settings buttons
    ZoomControls.tsx             — +/- zoom (top-right)
    SettingsModal.tsx            — Settings, export/import layout, sound toggle, debug toggle
    DebugView.tsx                — Debug overlay
    NewRoomToast.tsx             — Toast notification for new sessions (global, works in lobby + room)
  office/                       — Game engine (same as original webview-ui, ported)
    types.ts, toolUtils.ts, colorize.ts, floorTiles.ts, wallTiles.ts
    sprites/                    — spriteData.ts, spriteCache.ts
    editor/                     — editorActions.ts, editorState.ts, EditorToolbar.tsx
    layout/                     — furnitureCatalog.ts, layoutSerializer.ts, tileMap.ts
    engine/                     — characters.ts, officeState.ts, gameLoop.ts, renderer.ts, matrixEffect.ts
    components/                 — OfficeCanvas.tsx, ToolOverlay.tsx

scripts/                        — Asset extraction pipeline (from original project)
```

## Core Concepts

**Vocabulary**: Session = JSONL conversation file at `~/.claude/projects/<hash>/<uuid>.jsonl`. Agent = game character bound 1:1 to a session. Room = project with active sessions.

**Server ↔ Client**: WebSocket protocol defined in `shared/src/protocol.ts`. Three message categories:
- `LobbyMessage` — sent to clients with `currentRoom === null` (lobbyState, roomAppeared, roomDisappeared, lobbyAgentUpdate)
- `RoomMessage` — sent to clients in a specific room (roomState, agentCreated/Closed, tool events, layout)
- `GlobalMessage` — sent to ALL clients regardless of subscription (newRoomNotification)

**Session discovery**: `SessionScanner` polls `~/.claude/projects/` every 3s. Resolves real project path by reading `cwd` field from first JSONL line. Display names computed after each scan cycle via `computeDisplayNames()`.

**Client message buffering**: `wsClient.ts` buffers messages received before React handlers mount, flushing on first `onMessage()` registration. Prevents lobbyState loss during page load.

## Agent Status Tracking

JSONL transcripts at `~/.claude/projects/<project-hash>/<session-id>.jsonl`. Project hash = workspace path with `:`/`\`/`/` → `-`.

**JSONL record types**: `assistant` (tool_use blocks or thinking), `user` (tool_result or text prompt), `system` with `subtype: "turn_duration"` (reliable turn-end signal), `progress` with `data.type`: `agent_progress` (sub-agent forwarding), `bash_progress` (long-running Bash), `mcp_progress` (MCP tool status).

**File watching**: Hybrid `fs.watch` + 2s polling backup. Partial line buffering for mid-write reads. Tool done messages delayed 300ms to prevent flicker.

**Idle detection**: Two signals: (1) `system` + `subtype: "turn_duration"` — reliable for tool-using turns. (2) Text-idle timer (5s) — for text-only turns. Only starts when no tools used in current turn. Cancelled by any new JSONL data.

**Persistence**: Layouts persisted per-project at `~/.pixel-agents/layouts/<hash>.json`. Seat assignments at `<hash>.seats.json`. Atomic writes via `.tmp` + rename.

## Office UI

**Rendering**: Game state in imperative `OfficeState` class (not React state). Pixel-perfect: zoom = integer device-pixels-per-sprite-pixel (1x–10x). Default zoom = `Math.round(2 * devicePixelRatio)`. Z-sort all entities by Y. Pan via middle-mouse drag.

**UI styling**: Pixel art aesthetic — sharp corners (`borderRadius: 0`), solid backgrounds (`#1e1e2e`), `2px solid` borders, hard offset shadows. CSS variables in `index.css` `:root` (`--pixel-bg`, `--pixel-border`, `--pixel-accent`, etc.). Pixel font: FS Pixel Sans.

**Characters**: FSM states — active (pathfind to seat, typing/reading animation), idle (wander randomly, return to seat). 4-directional sprites, left = flipped right. Diverse palette assignment: first 6 agents get unique skins; beyond 6, random hue shift via `adjustSprite()`.

**Spawn/despawn**: Matrix-style digital rain animation (0.3s). Restored agents skip spawn effect.

**Sub-agents**: Negative IDs (from -1 down). Same palette + hueShift as parent. Spawn at closest free seat to parent.

**Speech bubbles**: Permission ("..." amber dots) stays until cleared. Waiting (green checkmark) auto-fades 2s.

**Seats**: Derived from chair furniture via `layoutToSeats()`. Click character → select → click seat → reassign.

## Layout Editor

Toggle via "Layout" button. Tools: SELECT, Floor paint, Wall paint, Erase, Furniture place, Pick, Eyedropper.

**Floor**: 7 patterns from `floors.png`, colorizable via HSBC sliders. **Walls**: Auto-tiling with bitmask. **Furniture**: Ghost preview, R to rotate, T to toggle state. **Undo/Redo**: 50-level, Ctrl+Z/Y. **Grid expansion**: Up to 64x64 tiles.

**Layout model**: `{ version: 1, cols, rows, tiles: TileType[], furniture: PlacedFurniture[], tileColors?: FloorColor[] }`.

## Asset System

**Loading**: Server reads PNGs from `server/assets/` via pngjs. Client fetches via HTTP (`/api/assets/*`). Null-safe: missing assets (floors, furniture) are handled gracefully.

**Character sprites**: 6 pre-colored PNGs (`char_0.png`–`char_5.png`). Each 112x96: 7 frames x 16px, 3 directions x 32px. Frame order: walk1-3, type1-2, read1-2.

**Catalog**: `furniture-catalog.json` with id, name, footprint, category, rotation/state groups. String-based type system.

**Load order**: characters → floors → walls → furniture → layout.

## Build & Dev

```sh
npm install
npm run build          # shared → server → client
npm start              # node server/dist/index.js (port 3000)
npm run dev            # concurrent server + client dev mode
```

## TypeScript Constraints

- No `enum` (`erasableSyntaxOnly`) — use `as const` objects
- `import type` required for type-only imports (`verbatimModuleSyntax`)
- `noUnusedLocals` / `noUnusedParameters`

## Constants

All magic numbers and strings are centralized in `shared/src/constants.ts` and `client/src/constants.ts`. CSS variables in `client/src/index.css` `:root`. Never add inline constants to source files.

## Key Patterns

- `AgentIdMapper` class converts server string UUIDs → numeric IDs for game engine, scoped per room via `useRef`
- `EditorState` is per-room via `useRef` (not module-level singleton)
- `MessageSink` abstraction replaces VS Code's `postMessage` for transport-agnostic broadcasting
- Path traversal prevention via `isValidProjectHash()` regex in wsRouter
- Layout validation via `isValidLayout()` before persistence
