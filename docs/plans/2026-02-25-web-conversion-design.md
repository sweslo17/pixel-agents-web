# Pixel Agents Web — Design Document

**Date**: 2026-02-25
**Status**: Approved
**Scope**: Convert VS Code extension to standalone web application

## Summary

Convert Pixel Agents from a VS Code extension into a standalone web app. A local Node.js server scans all Claude Code sessions on the machine, and a browser-based pixel art UI visualizes them in real-time. A pixel art lobby shows all active projects as rooms in a building; clicking a room enters the familiar office scene.

## Requirements

1. **Lobby**: Pixel art building overview displaying all Claude Code projects as rooms
2. **Room**: Same pixel art office visualization as the VS Code version
3. **Observe-only**: No launching or killing Claude Code sessions from the web UI
4. **Per-room layouts**: Each project has its own independent office layout with full editor
5. **Local-only**: Single machine, no auth, localhost binding
6. **No VS Code dependency**: Complete standalone web application

## Architecture

### Approach: Monolithic Node.js Server

Single process serving both the API/WebSocket backend and the static SPA frontend. Chosen for simplicity of deployment (`npm start`) and maximum code reuse from the existing codebase.

```
pixel-agent-web/
├── shared/              <- Shared types, constants, protocol definitions
├── server/              <- Fastify + ws backend
│   ├── routes/          <- HTTP endpoints (assets, health)
│   ├── ws/              <- WebSocket connection management
│   ├── core/            <- New: session scanning, lobby layout, display names
│   ├── claude/          <- Reused: fileWatcher, transcriptParser, timerManager
│   ├── assets/          <- Reused: assetLoader (PNG -> SpriteData)
│   └── persistence/     <- Modified: per-project layout persistence
├── client/              <- React + Vite SPA
│   ├── lobby/           <- New: lobby pixel art scene
│   ├── office/          <- Reused: entire game engine, editor, sprites
│   ├── hooks/           <- Modified: WebSocket transport instead of postMessage
│   └── components/      <- Modified: remove VS Code-specific actions
└── scripts/             <- Unchanged: asset extraction pipeline
```

### Data Flow

```
~/.claude/projects/       Server                     Browser
                          sessionScanner
  project dirs --------> (3s interval scan)
                               |
  *.jsonl files -------> fileWatcher ---WS---> lobby: room list + agent counts
                               |
                          transcriptParser
                               |
                          timerManager ---WS---> office: real-time agent status

  layout.json <-------> layoutPersistence <--WS---> editor: layout read/write

  assets/ (PNG) -------> assetLoader ---HTTP---> initial sprite data load
```

### Key Design Decisions

1. **Assets via HTTP, state via WebSocket** — Sprite data (~500KB) loaded once via REST with HTTP caching; real-time agent status pushed via WebSocket
2. **All projects monitored on startup** — File watchers on all active JSONLs so the lobby shows real-time agent counts
3. **Layout storage**: `~/.pixel-agents/layouts/<project-hash>.json` per project
4. **Agent ID = session UUID string** (not incremental int) — globally unique, matchable across reconnections

## WebSocket Protocol

### Connection Model

```
Browser                           Server
  |-- WS connect /ws ------------>|  defaults to lobby view
  |<-- lobbyState ----------------|  all rooms + agent counts
  |<-- lobbyAgentUpdate ----------|  per-room updates as they happen
  |                               |
  |-- joinRoom { projectHash } -->|  enter a room
  |<-- roomState -----------------|  full snapshot: agents + layout
  |<-- agentToolStart/Done/... ---|  real-time agent status
  |                               |
  |-- leaveRoom ----------------->|  back to lobby
  |<-- lobbyState ----------------|  re-push lobby state
  |                               |
  |-- saveLayout { layout } ----->|  persist room layout
  |-- saveAgentSeats { seats } -->|  persist seat assignments
```

### Message Types

#### Client -> Server

```typescript
type ClientMessage =
  | { type: 'joinRoom'; projectHash: string }
  | { type: 'leaveRoom' }
  | { type: 'saveLayout'; projectHash: string; layout: OfficeLayout }
  | { type: 'saveAgentSeats'; projectHash: string; seats: Record<string, SeatMeta> }
```

#### Server -> Client (Lobby)

```typescript
type LobbyMessage =
  | { type: 'lobbyState'; rooms: RoomSummary[] }
  | { type: 'lobbyAgentUpdate'; projectHash: string; summary: RoomSummary }
  | { type: 'roomAppeared'; room: RoomSummary }
  | { type: 'roomDisappeared'; projectHash: string }
```

#### Server -> Client (Room)

Reuses the existing VS Code extension protocol with minimal changes:

```typescript
type RoomMessage =
  | { type: 'roomState'; agents: AgentSnapshot[]; layout: OfficeLayout | null }
  | { type: 'agentCreated'; id: string }
  | { type: 'agentClosed'; id: string }
  | { type: 'agentStatus'; id: string; status: 'active' | 'waiting' }
  | { type: 'agentToolStart'; id: string; toolId: string; status: string }
  | { type: 'agentToolDone'; id: string; toolId: string }
  | { type: 'agentToolsClear'; id: string }
  | { type: 'agentToolPermission'; id: string }
  | { type: 'agentToolPermissionClear'; id: string }
  | { type: 'subagentToolStart'; id: string; parentToolId: string; toolId: string; status: string }
  | { type: 'subagentToolDone'; id: string; parentToolId: string; toolId: string }
  | { type: 'subagentClear'; id: string; parentToolId: string }
  | { type: 'subagentToolPermission'; id: string; parentToolId: string }
  | { type: 'layoutLoaded'; layout: OfficeLayout | null }
  | { type: 'settingsLoaded'; soundEnabled: boolean }
```

#### Assets (HTTP REST)

```
GET /api/assets/characters   -> CharacterDirectionSprites[]
GET /api/assets/floors       -> SpriteData[]
GET /api/assets/walls        -> SpriteData[]
GET /api/assets/furniture    -> { catalog: FurnitureAsset[], sprites: Record<string, SpriteData> }
```

## Server State

```typescript
interface ServerState {
  projects: Map<string, ProjectState>
}

interface ProjectState {
  projectHash: string
  projectPath: string           // reverse-resolved original path
  displayName: string           // shortest unique suffix
  agents: Map<string, AgentState>
  layout: OfficeLayout | null
  seatAssignments: Record<string, SeatMeta>
}

interface AgentState {
  id: string                    // sessionId (UUID)
  sessionId: string
  projectDir: string
  jsonlFile: string
  fileOffset: number
  lineBuffer: string
  activeToolIds: Set<string>
  activeToolStatuses: Map<string, string>
  activeToolNames: Map<string, string>
  activeSubagentToolIds: Map<string, Set<string>>
  activeSubagentToolNames: Map<string, Map<string, string>>
  isWaiting: boolean
  permissionSent: boolean
  hadToolsInTurn: boolean
  lastActivityTime: number
}
```

### Transport Abstraction

```typescript
// shared/transport.ts — replaces vscode.Webview
interface MessageSink {
  postMessage(msg: unknown): void
}
```

Server implements `WsBroadcaster` that sends to all WebSocket clients subscribed to a given projectHash. Existing modules (`transcriptParser`, `timerManager`) accept `MessageSink` instead of `vscode.Webview` — only type annotations change.

### Active Session Detection

A JSONL file is considered active if:
- Its mtime is within the last 5 minutes, OR
- The file watcher detects new bytes being written

Sessions going inactive trigger `agentClosed` and state cleanup.

### Catch-Up on Server Start

When the server starts with Claude Code already running:
- Read from the tail of each active JSONL to find the last `system` + `turn_duration` or last `assistant` record
- Infer current agent state (active/waiting) without reading the entire file

## Lobby Scene

### Visual Concept

A pixel art building viewed from above. Each project is a room in the building, rendered on a shared Canvas using the same tile/sprite system as the office view.

```
+---------------------------------------------+
|  PIXEL AGENTS HQ                            |
|  +----------+  +----------+  +----------+  |
|  | pixel-   |  | my-api   |  | frontend |  |
|  | agent-web|  |          |  |          |  |
|  |  * * *   |  |  *       |  |  * *     |  |
|  +----------+  +----------+  +----------+  |
|  +----------+  +----------+               . |
|  | backend  |  | infra    |               . |
|  |  (empty) |  |  *       |               . |
|  +----------+  +----------+                 |
+---------------------------------------------+
```

### Layout Algorithm

```typescript
// server/core/lobbyLayout.ts
function generateLobbyLayout(rooms: RoomSummary[]): LobbyLayout {
  // Each room: ROOM_WIDTH x ROOM_HEIGHT tiles
  // Corridors: CORRIDOR_WIDTH tiles between rooms
  // Grid: MAX_ROOMS_PER_ROW rooms per row
  // Active rooms sorted first, empty rooms last
}
```

### Room Block Contents

Each room block renders:
1. **Floor** — miniature preview of the room's layout (if exists), else default tiles
2. **Door** — center bottom of each room block
3. **Name label** — pixel font above the room, showing `displayName`
4. **Agent characters** — same sprites, real-time state (typing/idle/waiting)
5. **Empty rooms** — dimmed rendering; hidden by default (toggle to show)

### Interaction

- **Hover room** -> white semi-transparent overlay + full path tooltip
- **Click room** -> scene transition, enter office view
- **Pan/Zoom** -> same controls as office (middle-mouse drag, scroll wheel)
- **Room sorting** -> active rooms first, empty rooms last

### Scene Switching

- Enter room: client sends `joinRoom`, server responds with `roomState`, client switches to OfficeCanvas
- Return to lobby: top-left "Back to Lobby" button or Esc, client sends `leaveRoom`
- URL routing: `/` = lobby, `/room/:projectHash` = room (supports direct URL entry)

## Smart Display Names

Algorithm: start from the last path segment. If names collide, expand all colliding names by one more parent segment until unique.

```
Input:
  /Users/roger/work/code/pixel-agent-web
  /Users/roger/work/code/my-api
  /Users/roger/personal/code/my-api

Output:
  pixel-agent-web        <- last segment is unique
  work/code/my-api       <- expanded to disambiguate
  personal/code/my-api   <- expanded to disambiguate
```

## Code Reuse Strategy

| Module | Strategy | Change Estimate |
|---|---|---|
| transcriptParser.ts | Direct reuse, change type annotations | ~5 lines |
| timerManager.ts | Direct reuse, change type annotations | ~5 lines |
| fileWatcher.ts | Direct reuse, remove terminal adoption logic | ~20 lines removed |
| assetLoader.ts | Reuse, return data instead of postMessage | ~30 lines |
| layoutPersistence.ts | Modify path to per-project, remove VS Code migration | ~50 lines |
| constants.ts (backend) | Direct reuse | 0 lines |
| office/engine/* | Unchanged | 0 lines |
| office/layout/* | Unchanged | 0 lines |
| office/sprites/* | Unchanged | 0 lines |
| office/editor/* | Unchanged | 0 lines |
| office/colorize.ts, floorTiles.ts, wallTiles.ts | Unchanged | 0 lines |
| OfficeCanvas.tsx | Remove vscode.postMessage calls | ~10 lines |
| BottomToolbar.tsx | Remove "+ Agent", add "Back to Lobby" | ~15 lines |
| SettingsModal.tsx | Browser-native export/import | ~20 lines |
| useExtensionMessages.ts | Rewrite as useWebSocket.ts | New file |
| vscodeApi.ts | Delete, replaced by wsClient.ts | Deleted |
| notificationSound.ts | Unchanged | 0 lines |
| index.css | Replace --vscode-* vars with --pixel-* | ~10 lines |

## Build and Dev

### Monorepo Structure

npm workspaces with three packages: `shared`, `server`, `client`.

### Dev Workflow

```bash
npm install
npm run dev    # concurrently:
               #   server: tsx watch (port 3000)
               #   client: vite dev (port 5173, proxy -> 3000)
```

### Production

```bash
npm run build  # 1. shared: tsc
               # 2. server: esbuild bundle
               # 3. client: vite build
npm start      # Fastify serves everything on one port
```

### TypeScript Constraints

Inherited from original project:
- `erasableSyntaxOnly` — no enums, use `as const` objects
- `verbatimModuleSyntax` — `import type` for type-only imports
- `noUnusedLocals` / `noUnusedParameters`

### CSS

Replace VS Code CSS variable references (`--vscode-*`) with the existing `--pixel-*` custom properties already defined in the original `index.css`. The pixel art aesthetic (sharp corners, solid backgrounds, hard shadows, pixel font) is preserved exactly.

## Edge Cases

| Case | Handling |
|---|---|
| Project hash path ambiguity | Try most-likely path reconstruction; fall back to raw hash display |
| Hundreds of historical projects | Only create watchers for projects with recent JSONL activity (5min) |
| JSONL file deleted or truncated | Reset fileOffset to 0 if file size < offset |
| Multiple browser tabs | Independent WS connections; layout edits are last-write-wins |
| Server starts with Claude running | Tail-read JSONL to infer current state |
| WebSocket disconnection | Client auto-reconnects with exponential backoff (1s-8s cap) |

## Excluded from Scope

| Item | Reason |
|---|---|
| Launch/kill Claude Code from web | Observe-only mode |
| Multi-machine / team sharing | Single machine requirement |
| Authentication / login | Localhost-only tool |
| HTTPS | Localhost does not need TLS |
| Database | JSON files sufficient |
| VS Code extension backward compatibility | Clean break per requirement |
| Mobile responsive | Canvas-based pixel art not suited for small screens |
| Lobby layout editor | Lobby layout auto-generated by algorithm |
| focusAgent (terminal switching) | No VS Code terminals to switch to |

## Security

- Server binds to `127.0.0.1` only
- Read-only access to `~/.claude/` (JSONL files)
- Layout writes limited to `~/.pixel-agents/layouts/`
- No execution of JSONL content (pure JSON.parse + field extraction)

## Performance Estimates

| Resource | Estimate |
|---|---|
| Memory | ~50MB base + ~2MB per active project |
| CPU | Mostly idle; brief spikes on JSONL changes |
| File descriptors | 2 per active JSONL (fs.watch + polling) |
| Typical active projects | < 5 concurrent |
