# Pixel Agents Web Conversion — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert the VS Code extension into a standalone web app with a pixel art lobby showing all local Claude Code sessions as rooms.

**Architecture:** Monolithic Node.js server (Fastify + ws) serving a React SPA. Backend reuses existing JSONL parsing/watching modules with a `MessageSink` transport abstraction. Frontend reuses the entire game engine, replacing `vscodeApi.postMessage` with WebSocket.

**Tech Stack:** Node.js, Fastify, ws (WebSocket), React 19, Vite 7, TypeScript 5.9, npm workspaces, pngjs

---

### Task 1: Scaffold Monorepo Structure

**Files:**
- Create: `shared/package.json`
- Create: `shared/tsconfig.json`
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `client/package.json`
- Create: `client/tsconfig.json`
- Create: `client/tsconfig.app.json`
- Create: `client/tsconfig.node.json`
- Create: `client/vite.config.ts`
- Create: `client/index.html`
- Create: `tsconfig.base.json`
- Modify: `package.json` (root — replace VS Code extension config with workspace config)

**Step 1: Create root package.json with workspaces**

```json
{
  "name": "pixel-agent-web",
  "version": "1.0.0",
  "private": true,
  "workspaces": ["shared", "server", "client"],
  "scripts": {
    "dev": "concurrently -n server,client -c blue,green \"npm run dev -w server\" \"npm run dev -w client\"",
    "build": "npm run build -w shared && npm run build -w server && npm run build -w client",
    "start": "node server/dist/index.js",
    "typecheck": "tsc -b"
  },
  "devDependencies": {
    "concurrently": "^9.1.2",
    "typescript": "^5.9.3"
  }
}
```

**Step 2: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "sourceMap": true
  }
}
```

**Step 3: Create shared/package.json**

```json
{
  "name": "@pixel-agents/shared",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -b"
  }
}
```

**Step 4: Create shared/tsconfig.json**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "composite": true
  },
  "include": ["src"]
}
```

**Step 5: Create server/package.json**

```json
{
  "name": "@pixel-agents/server",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -b"
  },
  "dependencies": {
    "@pixel-agents/shared": "*",
    "fastify": "^5.3.3",
    "@fastify/static": "^8.1.0",
    "@fastify/websocket": "^11.0.3",
    "pngjs": "^7.0.0"
  },
  "devDependencies": {
    "@types/node": "22.x",
    "@types/pngjs": "^6.0.5",
    "tsx": "^4.21.0"
  }
}
```

**Step 6: Create server/tsconfig.json**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src"
  },
  "references": [
    { "path": "../shared" }
  ],
  "include": ["src"]
}
```

**Step 7: Create client/package.json**

```json
{
  "name": "@pixel-agents/client",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  },
  "devDependencies": {
    "@pixel-agents/shared": "*",
    "@types/react": "^19.2.5",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^5.1.1",
    "typescript": "~5.9.3",
    "vite": "^7.2.4"
  }
}
```

**Step 8: Create client/tsconfig.json, tsconfig.app.json, tsconfig.node.json**

`client/tsconfig.json`:
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

`client/tsconfig.app.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "noUncheckedSideEffectImports": true,
    "types": ["vite/client"]
  },
  "include": ["src"],
  "references": [
    { "path": "../shared" }
  ]
}
```

`client/tsconfig.node.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "noEmit": true
  },
  "include": ["vite.config.ts"]
}
```

**Step 9: Create client/vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws': { target: 'ws://localhost:3000', ws: true },
    },
  },
})
```

**Step 10: Create client/index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Pixel Agents</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 11: Install dependencies**

Run: `npm install`

**Step 12: Verify structure**

Run: `ls shared/ server/ client/`
Expected: Each directory has package.json and tsconfig.json

**Step 13: Commit**

```bash
git add -A
git commit -m "feat: scaffold monorepo with shared, server, client workspaces"
```

---

### Task 2: Create Shared Module — Types, Protocol, Constants

**Files:**
- Create: `shared/src/index.ts`
- Create: `shared/src/types.ts`
- Create: `shared/src/protocol.ts`
- Create: `shared/src/constants.ts`
- Create: `shared/src/transport.ts`

**Step 1: Create shared/src/transport.ts — the MessageSink interface**

```typescript
/** Transport abstraction replacing vscode.Webview */
export interface MessageSink {
  postMessage(msg: unknown): void
}
```

**Step 2: Create shared/src/types.ts — AgentState without vscode.Terminal**

Port from `src/types.ts`, removing `terminalRef` and changing `id` from `number` to `string`:

```typescript
export interface AgentState {
  id: string                    // sessionId UUID
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

export interface RoomSummary {
  projectHash: string
  displayName: string
  projectPath: string
  activeAgentCount: number
  agentSummaries: AgentSummary[]
  lastActivityTime: number
}

export interface AgentSummary {
  id: string
  isActive: boolean
  isWaiting: boolean
  currentTool: string | null
}

export interface SeatMeta {
  palette: number
  hueShift: number
  seatId: string | null
}

export interface AgentSnapshot {
  id: string
  isWaiting: boolean
  activeTools: Array<{ toolId: string; status: string }>
  palette?: number
  hueShift?: number
  seatId?: string | null
}
```

**Step 3: Create shared/src/protocol.ts — all WS message types**

```typescript
import type { RoomSummary, AgentSnapshot, SeatMeta } from './types.js'

// ── Client → Server ─────────────────────────────────────────
export type ClientMessage =
  | { type: 'joinRoom'; projectHash: string }
  | { type: 'leaveRoom' }
  | { type: 'saveLayout'; projectHash: string; layout: Record<string, unknown> }
  | { type: 'saveAgentSeats'; projectHash: string; seats: Record<string, SeatMeta> }

// ── Server → Client (Lobby) ─────────────────────────────────
export type LobbyMessage =
  | { type: 'lobbyState'; rooms: RoomSummary[] }
  | { type: 'lobbyAgentUpdate'; projectHash: string; summary: RoomSummary }
  | { type: 'roomAppeared'; room: RoomSummary }
  | { type: 'roomDisappeared'; projectHash: string }

// ── Server → Client (Room) ──────────────────────────────────
export type RoomMessage =
  | { type: 'roomState'; agents: AgentSnapshot[]; layout: Record<string, unknown> | null }
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
  | { type: 'layoutLoaded'; layout: Record<string, unknown> | null }
  | { type: 'settingsLoaded'; soundEnabled: boolean }

export type ServerMessage = LobbyMessage | RoomMessage
```

**Step 4: Create shared/src/constants.ts — merged from both sides**

Copy `src/constants.ts` in full, removing VS Code-specific identifiers (`VIEW_ID`, `COMMAND_*`, `WORKSPACE_KEY_*`, `TERMINAL_NAME_PREFIX`). Add new web-specific constants:

```typescript
// ── Timing (ms) ─────────────────────────────────────────────
export const JSONL_POLL_INTERVAL_MS = 1000
export const FILE_WATCHER_POLL_INTERVAL_MS = 2000
export const PROJECT_SCAN_INTERVAL_MS = 3000
export const TOOL_DONE_DELAY_MS = 300
export const PERMISSION_TIMER_DELAY_MS = 7000
export const TEXT_IDLE_DELAY_MS = 5000
export const SESSION_INACTIVE_THRESHOLD_MS = 5 * 60 * 1000  // 5 minutes

// ── Display Truncation ──────────────────────────────────────
export const BASH_COMMAND_DISPLAY_MAX_LENGTH = 30
export const TASK_DESCRIPTION_DISPLAY_MAX_LENGTH = 40

// ── PNG / Asset Parsing ─────────────────────────────────────
export const PNG_ALPHA_THRESHOLD = 128
export const WALL_PIECE_WIDTH = 16
export const WALL_PIECE_HEIGHT = 32
export const WALL_GRID_COLS = 4
export const WALL_BITMASK_COUNT = 16
export const FLOOR_PATTERN_COUNT = 7
export const FLOOR_TILE_SIZE = 16
export const CHARACTER_DIRECTIONS = ['down', 'up', 'right'] as const
export const CHAR_FRAME_W = 16
export const CHAR_FRAME_H = 32
export const CHAR_FRAMES_PER_ROW = 7
export const CHAR_COUNT = 6

// ── Layout Persistence ──────────────────────────────────────
export const LAYOUT_DIR = '.pixel-agents'
export const LAYOUTS_SUBDIR = 'layouts'
export const LAYOUT_FILE_POLL_INTERVAL_MS = 2000

// ── Server ──────────────────────────────────────────────────
export const DEFAULT_PORT = 3000
export const WS_PATH = '/ws'

// ── Lobby ───────────────────────────────────────────────────
export const LOBBY_ROOM_WIDTH = 10     // tiles per room
export const LOBBY_ROOM_HEIGHT = 8     // tiles per room
export const LOBBY_CORRIDOR_WIDTH = 2  // tiles between rooms
export const LOBBY_MAX_ROOMS_PER_ROW = 4
```

**Step 5: Create shared/src/index.ts — barrel export**

```typescript
export * from './types.js'
export * from './protocol.js'
export * from './constants.js'
export * from './transport.js'
```

**Step 6: Build shared module**

Run: `npm run build -w shared`
Expected: `shared/dist/` contains .js and .d.ts files

**Step 7: Commit**

```bash
git add shared/
git commit -m "feat: create shared module with types, protocol, constants, transport"
```

---

### Task 3: Port Backend Core — fileWatcher, transcriptParser, timerManager

**Files:**
- Create: `server/src/claude/transcriptParser.ts`
- Create: `server/src/claude/timerManager.ts`
- Create: `server/src/claude/fileWatcher.ts`

These are the most critical modules. Port from `src/` with minimal changes: replace `vscode.Webview` with `MessageSink`, change agent ID from `number` to `string`, remove terminal adoption logic.

**Step 1: Port timerManager.ts**

Copy `src/timerManager.ts` to `server/src/claude/timerManager.ts`. Changes:
- `import type * as vscode from 'vscode'` → `import type { MessageSink } from '@pixel-agents/shared'`
- All `vscode.Webview | undefined` → `MessageSink | undefined`
- All `agentId: number` → `agentId: string`
- Timer map types: `Map<number, ...>` → `Map<string, ...>`
- Import constants from `@pixel-agents/shared` instead of `./constants.js`

**Step 2: Port transcriptParser.ts**

Copy `src/transcriptParser.ts` to `server/src/claude/transcriptParser.ts`. Changes:
- Same vscode.Webview → MessageSink replacement
- Same number → string for agentId
- Import `AgentState` from `@pixel-agents/shared`
- Import constants from `@pixel-agents/shared`
- Import timer functions from `./timerManager.js`

**Step 3: Port fileWatcher.ts**

Copy `src/fileWatcher.ts` to `server/src/claude/fileWatcher.ts`. Changes:
- Same vscode.Webview → MessageSink replacement
- Same number → string for agentId
- Remove `import * as vscode from 'vscode'`
- Remove `scanForNewJsonlFiles()` and `ensureProjectScan()` (replaced by sessionScanner)
- Remove `adoptTerminalForFile()` and `reassignAgentToFile()` (no terminals in observe mode)
- Keep only `startFileWatching()`, `readNewLines()`, and `stopFileWatching()`
- Add `stopFileWatching()` function that cleans up watcher + polling for a given agent

**Step 4: Verify types compile**

Run: `cd server && npx tsc --noEmit`
Expected: No errors (or only errors from missing index.ts entry point, which is fine at this stage)

**Step 5: Commit**

```bash
git add server/src/claude/
git commit -m "feat: port fileWatcher, transcriptParser, timerManager to server"
```

---

### Task 4: Port Backend — assetLoader and layoutPersistence

**Files:**
- Create: `server/src/assets/assetLoader.ts`
- Create: `server/src/persistence/layoutPersistence.ts`
- Copy: `webview-ui/public/assets/` → `server/assets/` (static files)

**Step 1: Port assetLoader.ts**

Copy `src/assetLoader.ts` to `server/src/assets/assetLoader.ts`. Changes:
- Remove all `import * as vscode from 'vscode'`
- Remove all `send*ToWebview()` functions
- Keep all `load*()` functions as pure data loaders that return data
- `loadFurnitureAssets(assetsRoot)` returns `LoadedAssets`
- `loadFloorTiles(assetsRoot)` returns `string[][][]`
- `loadWallTiles(assetsRoot)` returns `string[][][]`
- `loadCharacterSprites(assetsRoot)` returns the character sprites array
- `loadDefaultLayout(assetsRoot)` returns `Record<string, unknown> | null`
- Import constants from `@pixel-agents/shared`
- Export `FurnitureAsset` and `LoadedAssets` interfaces

**Step 2: Port layoutPersistence.ts**

Copy `src/layoutPersistence.ts` to `server/src/persistence/layoutPersistence.ts`. Changes:
- Remove `import type { ExtensionContext } from 'vscode'`
- Change path from `~/.pixel-agents/layout.json` to `~/.pixel-agents/layouts/<projectHash>.json`
- `getLayoutFilePath(projectHash: string)` → `path.join(homedir(), '.pixel-agents', 'layouts', projectHash + '.json')`
- `readLayoutFromFile(projectHash)` — takes projectHash param
- `writeLayoutToFile(projectHash, layout)` — takes projectHash param
- Remove `migrateAndLoadLayout()` (no VS Code workspace state to migrate from)
- Add `loadLayout(projectHash, defaultLayout)` — reads file, falls back to defaultLayout
- Keep `watchLayoutFile()` but parametrize by projectHash
- Import constants from `@pixel-agents/shared`

**Step 3: Copy static assets**

```bash
cp -r webview-ui/public/assets server/assets
```

**Step 4: Verify types compile**

Run: `cd server && npx tsc --noEmit`

**Step 5: Commit**

```bash
git add server/src/assets/ server/src/persistence/ server/assets/
git commit -m "feat: port assetLoader and layoutPersistence to server"
```

---

### Task 5: Create Server Core — SessionScanner, ProjectManager, DisplayNames

**Files:**
- Create: `server/src/core/sessionScanner.ts`
- Create: `server/src/core/projectManager.ts`
- Create: `server/src/core/displayNames.ts`

**Step 1: Create displayNames.ts — smart shortest-unique-suffix algorithm**

```typescript
/**
 * Given a list of absolute paths, compute the shortest unique suffix for each.
 * Start from last segment; if collision, expand all colliding paths by one more parent.
 */
export function computeDisplayNames(paths: string[]): Map<string, string> {
  const result = new Map<string, string>()
  // Group paths by their current suffix (start with last segment)
  // Iteratively expand colliding groups until all unique
  // ... (full implementation)
  return result  // path → displayName
}

/**
 * Reverse a Claude Code project hash back to a filesystem path.
 * Hash rule: replace /:\\/g with '-', prepend '-' (leading separator).
 * Heuristic: leading '-' → '/', all other '-' kept as-is (ambiguous but works for most paths).
 * Falls back to raw hash if path doesn't exist on disk.
 */
export function reverseProjectHash(hash: string): string {
  // On macOS/Linux: leading char is always '-' (from leading '/')
  // Try: replace leading '-' with '/', keep rest as-is
  // Validate with fs.existsSync
  // ... (full implementation)
}
```

**Step 2: Create projectManager.ts — per-project agent state management**

```typescript
import type { AgentState, AgentSnapshot, RoomSummary, MessageSink } from '@pixel-agents/shared'
import { startFileWatching, stopFileWatching, readNewLines } from '../claude/fileWatcher.js'

export interface ProjectState {
  projectHash: string
  projectPath: string
  displayName: string
  agents: Map<string, AgentState>
  fileWatchers: Map<string, fs.FSWatcher>
  pollingTimers: Map<string, ReturnType<typeof setInterval>>
  waitingTimers: Map<string, ReturnType<typeof setTimeout>>
  permissionTimers: Map<string, ReturnType<typeof setTimeout>>
  messageSink: MessageSink | null  // null when no client is viewing this room
}

// Functions:
// - createProjectState(hash, path, displayName): ProjectState
// - addAgent(project, sessionId, jsonlFile): void
// - removeAgent(project, sessionId): void
// - getSnapshot(project): AgentSnapshot[]
// - getRoomSummary(project): RoomSummary
// - setMessageSink(project, sink): void — connects WS broadcaster
// - clearMessageSink(project): void — disconnects
```

**Step 3: Create sessionScanner.ts — global project directory scanner**

```typescript
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { PROJECT_SCAN_INTERVAL_MS, SESSION_INACTIVE_THRESHOLD_MS } from '@pixel-agents/shared'
import { computeDisplayNames, reverseProjectHash } from './displayNames.js'
import type { ProjectState } from './projectManager.js'

export class SessionScanner {
  private projects = new Map<string, ProjectState>()
  private scanTimer: ReturnType<typeof setInterval> | null = null
  private onRoomChange: (() => void) | null = null

  constructor(private onRoomAppeared: (p: ProjectState) => void,
              private onRoomDisappeared: (hash: string) => void,
              private onAgentChanged: (hash: string) => void) {}

  start(): void {
    this.scan()  // initial scan
    this.scanTimer = setInterval(() => this.scan(), PROJECT_SCAN_INTERVAL_MS)
  }

  stop(): void { /* clearInterval, cleanup all watchers */ }

  getProjects(): Map<string, ProjectState> { return this.projects }

  private scan(): void {
    // 1. Read ~/.claude/projects/ directory listing
    // 2. For each subdir (project hash):
    //    a. List *.jsonl files
    //    b. Check mtime — active if within SESSION_INACTIVE_THRESHOLD_MS
    //    c. New active session → addAgent + startFileWatching
    //    d. Session gone inactive → removeAgent + stopFileWatching
    //    e. New project dir with active sessions → onRoomAppeared
    //    f. Project with no more active sessions → onRoomDisappeared
    // 3. Recompute display names if project list changed
  }
}
```

**Step 4: Verify types compile**

Run: `cd server && npx tsc --noEmit`

**Step 5: Commit**

```bash
git add server/src/core/
git commit -m "feat: create sessionScanner, projectManager, displayNames"
```

---

### Task 6: Create Server — WebSocket Router and HTTP Routes

**Files:**
- Create: `server/src/ws/wsRouter.ts`
- Create: `server/src/ws/wsBroadcaster.ts`
- Create: `server/src/routes/assets.ts`
- Create: `server/src/routes/health.ts`
- Create: `server/src/index.ts`

**Step 1: Create wsBroadcaster.ts**

```typescript
import type { WebSocket } from 'ws'
import type { MessageSink, ServerMessage } from '@pixel-agents/shared'

interface ClientConnection {
  ws: WebSocket
  currentRoom: string | null  // projectHash or null (lobby)
}

export class WsBroadcaster {
  private clients = new Set<ClientConnection>()

  addClient(ws: WebSocket): ClientConnection { /* ... */ }
  removeClient(conn: ClientConnection): void { /* ... */ }

  /** Send to all clients in lobby (currentRoom === null) */
  broadcastLobby(msg: ServerMessage): void { /* ... */ }

  /** Send to all clients in a specific room */
  broadcastRoom(projectHash: string, msg: ServerMessage): void { /* ... */ }

  /** Create a MessageSink that broadcasts to a specific room */
  createRoomSink(projectHash: string): MessageSink {
    return {
      postMessage: (msg: unknown) => this.broadcastRoom(projectHash, msg as ServerMessage)
    }
  }

  /** Get count of clients viewing a specific room */
  getRoomViewerCount(projectHash: string): number { /* ... */ }

  /** Get count of clients in lobby */
  getLobbyViewerCount(): number { /* ... */ }
}
```

**Step 2: Create wsRouter.ts**

```typescript
import type { WebSocket } from 'ws'
import type { ClientMessage } from '@pixel-agents/shared'
import type { WsBroadcaster, ClientConnection } from './wsBroadcaster.js'
import type { SessionScanner } from '../core/sessionScanner.js'

export function handleWsConnection(
  ws: WebSocket,
  broadcaster: WsBroadcaster,
  scanner: SessionScanner,
): void {
  const conn = broadcaster.addClient(ws)

  // Send initial lobby state
  sendLobbyState(conn, scanner)

  ws.on('message', (raw: string) => {
    const msg: ClientMessage = JSON.parse(raw)
    switch (msg.type) {
      case 'joinRoom':
        conn.currentRoom = msg.projectHash
        sendRoomState(conn, scanner, msg.projectHash)
        break
      case 'leaveRoom':
        conn.currentRoom = null
        sendLobbyState(conn, scanner)
        break
      case 'saveLayout':
        // writeLayoutToFile(msg.projectHash, msg.layout)
        break
      case 'saveAgentSeats':
        // persist seat assignments
        break
    }
  })

  ws.on('close', () => broadcaster.removeClient(conn))
}
```

**Step 3: Create routes/assets.ts — HTTP asset endpoints**

```typescript
import type { FastifyInstance } from 'fastify'
import { loadCharacterSprites, loadFloorTiles, loadWallTiles, loadFurnitureAssets } from '../assets/assetLoader.js'

// Cache loaded assets in memory (loaded once on first request)
let cachedAssets: { characters: unknown; floors: unknown; walls: unknown; furniture: unknown } | null = null

export async function registerAssetRoutes(app: FastifyInstance, assetsRoot: string): Promise<void> {
  // Lazy-load all assets on first request
  function ensureLoaded() {
    if (cachedAssets) return cachedAssets
    cachedAssets = {
      characters: loadCharacterSprites(assetsRoot),
      floors: loadFloorTiles(assetsRoot),
      walls: loadWallTiles(assetsRoot),
      furniture: loadFurnitureAssets(assetsRoot),
    }
    return cachedAssets
  }

  app.get('/api/assets/characters', () => ensureLoaded().characters)
  app.get('/api/assets/floors', () => ensureLoaded().floors)
  app.get('/api/assets/walls', () => ensureLoaded().walls)
  app.get('/api/assets/furniture', () => {
    const { furniture } = ensureLoaded()
    // Convert Map to plain object for JSON serialization
    return furniture
  })
}
```

**Step 4: Create routes/health.ts**

```typescript
import type { FastifyInstance } from 'fastify'

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', () => ({ status: 'ok', timestamp: Date.now() }))
}
```

**Step 5: Create server/src/index.ts — entry point**

```typescript
import * as path from 'path'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifyWebSocket from '@fastify/websocket'
import { DEFAULT_PORT } from '@pixel-agents/shared'
import { SessionScanner } from './core/sessionScanner.js'
import { WsBroadcaster } from './ws/wsBroadcaster.js'
import { handleWsConnection } from './ws/wsRouter.js'
import { registerAssetRoutes } from './routes/assets.js'
import { registerHealthRoutes } from './routes/health.js'

const app = Fastify({ logger: true })
const broadcaster = new WsBroadcaster()

// Determine assets root
const assetsRoot = path.join(import.meta.dirname, '..', 'assets')

// Session scanner with callbacks that broadcast to lobby
const scanner = new SessionScanner(
  (project) => broadcaster.broadcastLobby({ type: 'roomAppeared', room: getRoomSummary(project) }),
  (hash) => broadcaster.broadcastLobby({ type: 'roomDisappeared', projectHash: hash }),
  (hash) => {
    // Broadcast to lobby (agent count update)
    // Broadcast to room viewers (agent state changes) — handled by MessageSink
  },
)

await app.register(fastifyWebSocket)
await app.register(fastifyStatic, {
  root: path.join(import.meta.dirname, '..', '..', 'client', 'dist'),
  prefix: '/',
})

await registerAssetRoutes(app, assetsRoot)
await registerHealthRoutes(app)

app.get('/ws', { websocket: true }, (socket) => {
  handleWsConnection(socket, broadcaster, scanner)
})

// SPA fallback: serve index.html for non-API routes
app.setNotFoundHandler((req, reply) => {
  if (!req.url.startsWith('/api/') && !req.url.startsWith('/ws')) {
    return reply.sendFile('index.html')
  }
  return reply.code(404).send({ error: 'Not found' })
})

scanner.start()
await app.listen({ port: DEFAULT_PORT, host: '127.0.0.1' })
console.log(`Pixel Agents running at http://localhost:${DEFAULT_PORT}`)
```

**Step 6: Verify server starts**

Run: `npm run dev -w server`
Expected: Server starts on port 3000, `/api/health` returns `{ status: 'ok' }`

**Step 7: Commit**

```bash
git add server/src/
git commit -m "feat: create Fastify server with WS router, asset routes, session scanner"
```

---

### Task 7: Copy and Adapt Client — Game Engine (Zero-Change Files)

**Files:**
- Copy: `webview-ui/src/office/` → `client/src/office/`
- Copy: `webview-ui/src/fonts/` → `client/src/fonts/`
- Copy: `webview-ui/src/notificationSound.ts` → `client/src/notificationSound.ts`
- Copy: `webview-ui/src/constants.ts` → `client/src/constants.ts`

**Step 1: Copy all zero-change files**

```bash
# Game engine — entire directory tree
cp -r webview-ui/src/office/ client/src/office/

# Fonts
cp -r webview-ui/src/fonts/ client/src/fonts/

# Sound
cp webview-ui/src/notificationSound.ts client/src/notificationSound.ts

# Client-side constants (grid, animation, rendering)
cp webview-ui/src/constants.ts client/src/constants.ts
```

**Step 2: Remove vscodeApi import from office/types.ts if present**

Check `client/src/office/types.ts` — it imports from `../constants.ts` which is fine. No vscode dependency.

**Step 3: Verify no vscode imports leaked into office/**

Run: `grep -r "vscodeApi\|acquireVsCodeApi\|from 'vscode'" client/src/office/`
Expected: No matches

**Step 4: Commit**

```bash
git add client/src/office/ client/src/fonts/ client/src/notificationSound.ts client/src/constants.ts
git commit -m "feat: copy game engine, fonts, sound, constants to client"
```

---

### Task 8: Create Client — WebSocket Client and Asset Fetcher

**Files:**
- Create: `client/src/wsClient.ts`
- Create: `client/src/assetFetcher.ts`

**Step 1: Create wsClient.ts — replaces vscodeApi.ts**

```typescript
import type { ClientMessage, ServerMessage } from '@pixel-agents/shared'

type MessageHandler = (msg: ServerMessage) => void

let ws: WebSocket | null = null
let handlers: MessageHandler[] = []
let reconnectAttempt = 0
let pendingRoom: string | null = null
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000]

export function connect(): void {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  ws = new WebSocket(`${protocol}//${location.host}/ws`)

  ws.onopen = () => {
    reconnectAttempt = 0
    // Rejoin room if we were in one before disconnect
    if (pendingRoom) {
      send({ type: 'joinRoom', projectHash: pendingRoom })
    }
  }

  ws.onmessage = (e) => {
    const msg: ServerMessage = JSON.parse(e.data as string)
    for (const h of handlers) h(msg)
  }

  ws.onclose = () => {
    const delay = RECONNECT_DELAYS[Math.min(reconnectAttempt, RECONNECT_DELAYS.length - 1)]
    reconnectAttempt++
    setTimeout(connect, delay)
  }
}

export function send(msg: ClientMessage): void {
  if (msg.type === 'joinRoom') pendingRoom = msg.projectHash
  if (msg.type === 'leaveRoom') pendingRoom = null
  ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg))
}

export function onMessage(handler: MessageHandler): () => void {
  handlers.push(handler)
  return () => { handlers = handlers.filter(h => h !== handler) }
}

export function disconnect(): void {
  ws?.close()
  ws = null
}
```

**Step 2: Create assetFetcher.ts — HTTP fetch for sprites**

```typescript
interface AssetCache {
  characters: unknown | null
  floors: unknown | null
  walls: unknown | null
  furniture: unknown | null
}

const cache: AssetCache = { characters: null, floors: null, walls: null, furniture: null }

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Asset fetch failed: ${url} ${res.status}`)
  return res.json() as Promise<T>
}

export async function loadAllAssets(): Promise<{
  characters: unknown
  floors: unknown
  walls: unknown
  furniture: unknown
}> {
  if (cache.characters && cache.floors && cache.walls && cache.furniture) {
    return cache as Required<AssetCache>
  }
  const [characters, floors, walls, furniture] = await Promise.all([
    fetchJson('/api/assets/characters'),
    fetchJson('/api/assets/floors'),
    fetchJson('/api/assets/walls'),
    fetchJson('/api/assets/furniture'),
  ])
  Object.assign(cache, { characters, floors, walls, furniture })
  return { characters, floors, walls, furniture }
}
```

**Step 3: Commit**

```bash
git add client/src/wsClient.ts client/src/assetFetcher.ts
git commit -m "feat: create WebSocket client and HTTP asset fetcher"
```

---

### Task 9: Create Client — useWebSocket Hook (Replaces useExtensionMessages)

**Files:**
- Create: `client/src/hooks/useWebSocket.ts`

This is the most critical client-side change. Port `useExtensionMessages.ts` logic, replacing `window.addEventListener('message')` + `vscode.postMessage` with the wsClient.

**Step 1: Create useWebSocket.ts**

Port `webview-ui/src/hooks/useExtensionMessages.ts` with these changes:
- Import from `../wsClient.js` instead of `../vscodeApi.js`
- Asset loading: call `loadAllAssets()` from `../assetFetcher.js` on mount, then call `setCharacterTemplates`, `setFloorSprites`, `setWallSprites`, `buildDynamicCatalog` directly — instead of waiting for messages
- On mount: call `wsClient.connect()` and register message handler via `wsClient.onMessage()`
- `webviewReady` message replaced by `joinRoom` (sent by caller, not this hook)
- Handle `roomState` message: apply all agent snapshots at once (replaces `existingAgents`)
- Handle `layoutLoaded` message: same logic
- All agent* messages: same logic, but with `string` IDs instead of `number`
- `saveAgentSeats`: call `wsClient.send()` instead of `vscode.postMessage()`
- Remove `selectedAgent` tracking (no terminal focus in observe mode)
- Export `useWebSocket(projectHash, getOfficeState, onLayoutLoaded?, isEditDirty?)`

**Step 2: Commit**

```bash
git add client/src/hooks/useWebSocket.ts
git commit -m "feat: create useWebSocket hook replacing useExtensionMessages"
```

---

### Task 10: Create Client — useLobby Hook

**Files:**
- Create: `client/src/hooks/useLobby.ts`

**Step 1: Create useLobby.ts**

```typescript
import { useState, useEffect } from 'react'
import type { RoomSummary } from '@pixel-agents/shared'
import { onMessage } from '../wsClient.js'

export function useLobby() {
  const [rooms, setRooms] = useState<RoomSummary[]>([])

  useEffect(() => {
    const unsub = onMessage((msg) => {
      switch (msg.type) {
        case 'lobbyState':
          setRooms(msg.rooms)
          break
        case 'lobbyAgentUpdate':
          setRooms(prev => prev.map(r =>
            r.projectHash === msg.projectHash ? msg.summary : r
          ))
          break
        case 'roomAppeared':
          setRooms(prev => [...prev, msg.room])
          break
        case 'roomDisappeared':
          setRooms(prev => prev.filter(r => r.projectHash !== msg.projectHash))
          break
      }
    })
    return unsub
  }, [])

  // Sort: active rooms first, then by last activity
  const sortedRooms = [...rooms].sort((a, b) => {
    if (a.activeAgentCount > 0 && b.activeAgentCount === 0) return -1
    if (a.activeAgentCount === 0 && b.activeAgentCount > 0) return 1
    return b.lastActivityTime - a.lastActivityTime
  })

  return { rooms: sortedRooms }
}
```

**Step 2: Commit**

```bash
git add client/src/hooks/useLobby.ts
git commit -m "feat: create useLobby hook for lobby state"
```

---

### Task 11: Adapt Client Components — BottomToolbar, SettingsModal, CSS

**Files:**
- Copy + Modify: `webview-ui/src/components/BottomToolbar.tsx` → `client/src/components/BottomToolbar.tsx`
- Copy + Modify: `webview-ui/src/components/SettingsModal.tsx` → `client/src/components/SettingsModal.tsx`
- Copy: `webview-ui/src/components/ZoomControls.tsx` → `client/src/components/ZoomControls.tsx`
- Copy: `webview-ui/src/components/DebugView.tsx` → `client/src/components/DebugView.tsx`
- Copy + Modify: `webview-ui/src/index.css` → `client/src/index.css`
- Copy + Modify: `webview-ui/src/hooks/useEditorActions.ts` → `client/src/hooks/useEditorActions.ts`
- Copy: `webview-ui/src/hooks/useEditorKeyboard.ts` → `client/src/hooks/useEditorKeyboard.ts`

**Step 1: Copy all component files**

```bash
cp webview-ui/src/components/ZoomControls.tsx client/src/components/ZoomControls.tsx
cp webview-ui/src/components/DebugView.tsx client/src/components/DebugView.tsx
cp webview-ui/src/components/BottomToolbar.tsx client/src/components/BottomToolbar.tsx
cp webview-ui/src/components/SettingsModal.tsx client/src/components/SettingsModal.tsx
cp webview-ui/src/hooks/useEditorActions.ts client/src/hooks/useEditorActions.ts
cp webview-ui/src/hooks/useEditorKeyboard.ts client/src/hooks/useEditorKeyboard.ts
cp webview-ui/src/index.css client/src/index.css
```

**Step 2: Modify BottomToolbar.tsx**

- Remove "+ Agent" button (observe-only mode)
- Add "Back to Lobby" button that calls a callback prop `onBackToLobby`
- Remove `import { vscode } from '../vscodeApi.js'`

**Step 3: Modify SettingsModal.tsx**

- Remove `openSessionsFolder` action (no VS Code file system access)
- Replace `exportLayout` / `importLayout` with browser-native:
  - Export: create `Blob` + `URL.createObjectURL` + `<a download>`
  - Import: create hidden `<input type="file">` + `FileReader`
- Replace `vscode.postMessage({ type: 'setSoundEnabled' })` with a callback prop or direct wsClient call

**Step 4: Modify useEditorActions.ts**

- Replace `vscode.postMessage({ type: 'saveLayout', layout })` with `wsClient.send({ type: 'saveLayout', projectHash, layout })`
- Add `projectHash` parameter to the hook

**Step 5: Modify index.css**

- Replace `var(--vscode-charts-yellow, #cca700)` with `#cca700` (remove VS Code fallback pattern)
- Replace `var(--vscode-charts-blue, #3794ff)` with `#3794ff`
- Keep all `--pixel-*` variables as-is

**Step 6: Commit**

```bash
git add client/src/components/ client/src/hooks/ client/src/index.css
git commit -m "feat: adapt components, hooks, CSS for standalone web"
```

---

### Task 12: Create Client — Lobby Scene (LobbyCanvas, lobbyState, lobbyRenderer)

**Files:**
- Create: `client/src/lobby/LobbyCanvas.tsx`
- Create: `client/src/lobby/lobbyState.ts`
- Create: `client/src/lobby/lobbyRenderer.ts`

**Step 1: Create lobbyState.ts**

```typescript
import type { RoomSummary } from '@pixel-agents/shared'
import { LOBBY_ROOM_WIDTH, LOBBY_ROOM_HEIGHT, LOBBY_CORRIDOR_WIDTH, LOBBY_MAX_ROOMS_PER_ROW } from '@pixel-agents/shared'
import { TILE_SIZE } from '../office/types.js'

export interface LobbyRoom {
  projectHash: string
  displayName: string
  agentCount: number
  // Position in pixel coordinates
  x: number
  y: number
  width: number   // in pixels
  height: number  // in pixels
}

export interface LobbyState {
  rooms: LobbyRoom[]
  totalWidth: number
  totalHeight: number
  hoveredRoom: string | null
}

export function buildLobbyLayout(rooms: RoomSummary[]): LobbyState {
  const roomW = LOBBY_ROOM_WIDTH * TILE_SIZE
  const roomH = LOBBY_ROOM_HEIGHT * TILE_SIZE
  const corridorW = LOBBY_CORRIDOR_WIDTH * TILE_SIZE
  const padding = TILE_SIZE * 2  // outer padding

  const lobbyRooms: LobbyRoom[] = rooms.map((r, i) => {
    const col = i % LOBBY_MAX_ROOMS_PER_ROW
    const row = Math.floor(i / LOBBY_MAX_ROOMS_PER_ROW)
    return {
      projectHash: r.projectHash,
      displayName: r.displayName,
      agentCount: r.activeAgentCount,
      x: padding + col * (roomW + corridorW),
      y: padding + row * (roomH + corridorW),
      width: roomW,
      height: roomH,
    }
  })

  const maxCol = Math.min(rooms.length, LOBBY_MAX_ROOMS_PER_ROW)
  const maxRow = Math.ceil(rooms.length / LOBBY_MAX_ROOMS_PER_ROW)
  return {
    rooms: lobbyRooms,
    totalWidth: padding * 2 + maxCol * roomW + (maxCol - 1) * corridorW,
    totalHeight: padding * 2 + maxRow * roomH + (maxRow - 1) * corridorW,
    hoveredRoom: null,
  }
}

export function hitTestRoom(state: LobbyState, worldX: number, worldY: number): string | null {
  for (const room of state.rooms) {
    if (worldX >= room.x && worldX < room.x + room.width &&
        worldY >= room.y && worldY < room.y + room.height) {
      return room.projectHash
    }
  }
  return null
}
```

**Step 2: Create lobbyRenderer.ts**

Uses the same Canvas 2D rendering approach as the office. Draws:
- Background (dark floor tiles for corridor)
- Each room block with floor tiles, walls, and name label
- Mini character sprites inside rooms based on agent counts
- Hover highlight overlay
- Building title "PIXEL AGENTS HQ" at top

Reuses existing sprite cache and tile rendering from `office/sprites/spriteCache.ts` and `office/floorTiles.ts`.

**Step 3: Create LobbyCanvas.tsx**

Similar structure to `OfficeCanvas.tsx` but simpler:
- Canvas setup with DPR handling (same pattern)
- `requestAnimationFrame` loop for hover animations
- Mouse handlers for hover (highlight room) and click (navigate to room)
- Pan/zoom support (same `panRef` pattern)
- No editor, no drag-to-move, no seat assignment

**Step 4: Commit**

```bash
git add client/src/lobby/
git commit -m "feat: create lobby pixel art scene with room rendering"
```

---

### Task 13: Create Client — App.tsx with Routing

**Files:**
- Create: `client/src/App.tsx`
- Create: `client/src/main.tsx`

**Step 1: Create main.tsx**

```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import { connect } from './wsClient.js'
import './index.css'

connect()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

**Step 2: Create App.tsx**

Top-level component with simple client-side routing (no library needed):

```typescript
import { useState, useCallback } from 'react'
import { LobbyCanvas } from './lobby/LobbyCanvas.js'
import { RoomView } from './RoomView.js'  // wraps OfficeCanvas + hooks
import { send } from './wsClient.js'

export function App() {
  const [currentRoom, setCurrentRoom] = useState<string | null>(() => {
    // Check URL: /room/:hash → enter room directly
    const match = location.pathname.match(/^\/room\/(.+)$/)
    return match ? match[1] : null
  })

  const enterRoom = useCallback((projectHash: string) => {
    send({ type: 'joinRoom', projectHash })
    setCurrentRoom(projectHash)
    history.pushState(null, '', `/room/${projectHash}`)
  }, [])

  const exitRoom = useCallback(() => {
    send({ type: 'leaveRoom' })
    setCurrentRoom(null)
    history.pushState(null, '', '/')
  }, [])

  // Handle browser back/forward
  // window.onpopstate ...

  if (currentRoom) {
    return <RoomView projectHash={currentRoom} onBack={exitRoom} />
  }
  return <LobbyCanvas onEnterRoom={enterRoom} />
}
```

**Step 3: Create RoomView.tsx**

Port `webview-ui/src/App.tsx` as `client/src/RoomView.tsx`. Changes:
- Remove `import { vscode } from './vscodeApi.js'`
- Replace `useExtensionMessages` with `useWebSocket(projectHash, ...)`
- Add `projectHash` prop and `onBack` prop
- Replace `focusAgent` / `closeAgent` postMessage calls — `focusAgent` becomes a no-op or opens URL, `closeAgent` removed
- Add "Back to Lobby" in the toolbar
- Keep `EditActionBar`, `OfficeCanvas`, `ToolOverlay`, `EditorToolbar`, `ZoomControls`, `BottomToolbar`, `SettingsModal`, `DebugView` as-is

**Step 4: Commit**

```bash
git add client/src/App.tsx client/src/main.tsx client/src/RoomView.tsx
git commit -m "feat: create App with lobby/room routing and RoomView"
```

---

### Task 14: Integration Testing — End-to-End Smoke Test

**Files:** No new files

**Step 1: Build everything**

Run: `npm run build`
Expected: All three workspaces build without errors

**Step 2: Start server**

Run: `npm start`
Expected: Server starts, logs `Pixel Agents running at http://localhost:3000`

**Step 3: Verify health endpoint**

Run: `curl http://localhost:3000/api/health`
Expected: `{"status":"ok","timestamp":...}`

**Step 4: Verify asset endpoints**

Run: `curl -s http://localhost:3000/api/assets/furniture | head -c 200`
Expected: JSON with catalog and sprites

**Step 5: Verify SPA serves**

Run: `curl -s http://localhost:3000/ | head -5`
Expected: HTML with `<div id="root">`

**Step 6: Manual browser test**

Open `http://localhost:3000` in browser:
- Lobby should render with pixel art background
- If Claude Code is running, rooms should appear with agent characters
- Click a room → office view loads with layout editor
- "Back to Lobby" returns to lobby

**Step 7: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration fixes from end-to-end smoke test"
```

---

### Task 15: Polish — WebSocket Reconnection, Error States, Loading UI

**Files:**
- Modify: `client/src/wsClient.ts`
- Modify: `client/src/App.tsx`
- Modify: `client/src/RoomView.tsx`

**Step 1: Add connection status to wsClient.ts**

Add a `connectionStatus` observable (`'connecting' | 'connected' | 'disconnected'`) with subscriber pattern so React can display connection state.

**Step 2: Add loading/error states to App.tsx**

- Show "Connecting..." overlay when WebSocket is not yet connected
- Show "Reconnecting..." overlay with count when disconnected
- Show "No active sessions" message in lobby when rooms array is empty

**Step 3: Add loading state to RoomView.tsx**

- Show "Loading office..." while waiting for `roomState` + assets
- Handle case where room doesn't exist (server sends empty state)

**Step 4: Commit**

```bash
git add client/src/
git commit -m "feat: add connection status, loading states, error handling"
```

---

### Task 16: Cleanup — Remove Old VS Code Extension Files

**Files:**
- Delete: `src/` (entire old extension backend)
- Delete: `webview-ui/` (entire old webview)
- Delete: `esbuild.js`
- Delete: `.vscode/` (extension launch configs)
- Modify: root `package.json` if any old scripts remain

**Step 1: Remove old source directories**

```bash
rm -rf src/ webview-ui/ esbuild.js
```

**Step 2: Clean up root package.json**

Remove any remaining VS Code-specific fields: `engines.vscode`, `activationEvents`, `main`, `contributes`, `publisher`, `displayName`, `categories`.

**Step 3: Verify build still works**

Run: `npm run build`
Expected: Clean build with no errors

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove old VS Code extension source files"
```

---

## Task Dependency Graph

```
Task 1 (scaffold)
  ├── Task 2 (shared types)
  │     ├── Task 3 (port backend core)
  │     │     └── Task 5 (scanner + manager)
  │     │           └── Task 6 (server entry + WS + routes)
  │     ├── Task 4 (port assets + layout)
  │     │     └── Task 6
  │     ├── Task 8 (wsClient + assetFetcher)
  │     │     ├── Task 9 (useWebSocket hook)
  │     │     └── Task 10 (useLobby hook)
  │     └── Task 12 (lobby scene)
  ├── Task 7 (copy game engine)
  │     ├── Task 9
  │     ├── Task 11 (adapt components)
  │     └── Task 12
  └── Task 11
        └── Task 13 (App + routing)
              └── Task 14 (integration test)
                    └── Task 15 (polish)
                          └── Task 16 (cleanup)
```

Critical path: 1 → 2 → 3 → 5 → 6 → 14

Parallelizable:
- Tasks 3, 4 can run in parallel (both depend on 2)
- Tasks 7, 8 can run in parallel (both depend on 1/2)
- Tasks 9, 10, 11, 12 can partially overlap (all depend on 7+8)
