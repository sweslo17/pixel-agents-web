# Pixel Agents Web

A standalone web application that visualizes your active [Claude Code](https://docs.anthropic.com/en/docs/claude-code) sessions as animated pixel art characters in a virtual office.

Each Claude Code session running on your machine is detected automatically and assigned a character that walks around, sits at desks, and visually reflects what the agent is doing — typing when writing code, reading when searching files, waiting when it needs your attention.

> Forked from [pixel-agents](https://github.com/pablodelucca/pixel-agents) (VS Code extension) and converted to a standalone web app with a Node.js server + React SPA.

![Pixel Agents screenshot](webview-ui/public/Screenshot.jpg)

## Features

- **Auto-discovery** — scans `~/.claude/projects/` every 3 seconds; no manual setup needed
- **Lobby view** — see all active projects at a glance, click to enter a room
- **Live activity tracking** — characters animate based on what the agent is actually doing (writing, reading, running commands)
- **New session notification** — toast notification when a new session appears, click to jump to that room
- **Office layout editor** — design your office with floors, walls, and furniture
- **Speech bubbles** — visual indicators when an agent is waiting for input or needs permission
- **Sound notifications** — optional chime when an agent finishes its turn
- **Sub-agent visualization** — Task tool sub-agents spawn as separate characters linked to their parent
- **Persistent layouts** — office design saved per-project at `~/.pixel-agents/layouts/`
- **Diverse characters** — 6 unique character palettes with hue-shift for additional variety

## Requirements

- **Node.js** 20 or later
- **Claude Code CLI** installed and running (the app observes its JSONL transcripts)

## Quick Start

```bash
# Clone and install
git clone https://github.com/sweslo17/pixel-agents-web.git
cd pixel-agents-web
npm install

# Build all packages (shared → server → client)
npm run build

# Start the server
npm start
```

Open **http://localhost:3000** in your browser. Any active Claude Code sessions will appear automatically.

## Development

```bash
# Run server and client in dev mode with hot reload
npm run dev
```

This starts the Fastify server (port 3000) and Vite dev server (port 5173) concurrently.

## Project Structure

```
shared/       — Shared types, protocol definitions, constants
server/       — Fastify HTTP + WebSocket server
  src/
    core/     — SessionScanner, ProjectManager, DisplayNames
    claude/   — FileWatcher, TranscriptParser, TimerManager
    ws/       — WebSocket broadcaster and message router
    routes/   — HTTP API endpoints (assets, health)
    assets/   — Asset loader (PNG → sprite data)
    persistence/ — Layout and seat file I/O
client/       — React SPA (Vite)
  src/
    office/   — Game engine, renderer, characters, layout editor
    lobby/    — Lobby canvas and renderer
    hooks/    — WebSocket, lobby, connection hooks
    components/ — UI overlays (toolbar, settings, zoom, toast)
```

## How It Works

1. **Session scanning** — the server watches `~/.claude/projects/` for JSONL transcript files modified within the last 5 minutes
2. **JSONL parsing** — each active session's transcript is tailed in real-time to detect tool usage, status changes, and sub-agent activity
3. **WebSocket relay** — parsed events are broadcast to connected browser clients
4. **Canvas rendering** — the React client renders a pixel art office with character state machines (idle/walk/type/read), BFS pathfinding, and z-sorted entity drawing

No modifications to Claude Code are needed — it's purely observational.

## Office Assets

The office tileset is **[Office Interior Tileset (16x16)](https://donarg.itch.io/officetileset)** by **Donarg** ($2 USD on itch.io). It is not included in this repository. The app works without it — you get characters, walls, and basic layout, but furniture requires the imported assets.

## License

[MIT](LICENSE)
