# Contributing to Pixel Agents Web

Thanks for your interest in contributing! All contributions are welcome — features, bug fixes, documentation improvements, and more.

This project is licensed under the [MIT License](LICENSE), so your contributions will be too.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 20 or later

### Setup

```bash
git clone https://github.com/sweslo17/pixel-agents-web.git
cd pixel-agents-web
npm install
npm run build
```

### Development

```bash
npm run dev    # runs server + client concurrently with hot reload
```

The Fastify server runs on port 3000 and the Vite dev server on port 5173.

## Project Structure

| Directory | Description |
|---|---|
| `shared/` | Shared types, protocol, constants (npm workspace) |
| `server/` | Fastify HTTP + WebSocket server (npm workspace) |
| `client/` | React SPA with Canvas rendering (npm workspace, Vite) |
| `scripts/` | Asset extraction and generation tooling |

## Code Guidelines

### Constants

All magic numbers and strings are centralized — don't add inline constants:

- **Shared**: `shared/src/constants.ts` — timing, parsing, layout, server config
- **Client**: `client/src/constants.ts` — grid, animation, rendering, camera, zoom, editor
- **CSS variables**: `client/src/index.css` `:root` block (`--pixel-*` properties)

### TypeScript

- No `enum` — use `as const` objects (`erasableSyntaxOnly`)
- `import type` required for type-only imports (`verbatimModuleSyntax`)
- `noUnusedLocals` / `noUnusedParameters` are enabled

### UI Styling

The project uses a pixel art aesthetic. All overlays should use:

- Sharp corners (`border-radius: 0`)
- Solid backgrounds and `2px solid` borders
- Hard offset shadows (`2px 2px 0px`, no blur)
- The FS Pixel Sans font (loaded in `index.css`)

## Submitting a Pull Request

1. Fork the repo and create a feature branch from `main`
2. Make your changes
3. Run the full build to verify:
   ```bash
   npm run build
   ```
4. Open a pull request against `main` with:
   - A clear description of what changed and why
   - How you tested the changes
   - **Screenshots or GIFs for any UI changes**

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).
