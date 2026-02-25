// ── Timing (ms) ──────────────────────────────────────────────
export const JSONL_POLL_INTERVAL_MS = 1000;
export const FILE_WATCHER_POLL_INTERVAL_MS = 2000;
export const PROJECT_SCAN_INTERVAL_MS = 3000;
export const TOOL_DONE_DELAY_MS = 300;
export const PERMISSION_TIMER_DELAY_MS = 7000;
export const TEXT_IDLE_DELAY_MS = 5000;
export const SESSION_INACTIVE_THRESHOLD_MS = 5 * 60 * 1000;

// ── Display Truncation ──────────────────────────────────────
export const BASH_COMMAND_DISPLAY_MAX_LENGTH = 30;
export const TASK_DESCRIPTION_DISPLAY_MAX_LENGTH = 40;

// ── PNG / Asset Parsing ─────────────────────────────────────
export const PNG_ALPHA_THRESHOLD = 128;
export const WALL_PIECE_WIDTH = 16;
export const WALL_PIECE_HEIGHT = 32;
export const WALL_GRID_COLS = 4;
export const WALL_BITMASK_COUNT = 16;
export const FLOOR_PATTERN_COUNT = 7;
export const FLOOR_TILE_SIZE = 16;
export const CHARACTER_DIRECTIONS = ['down', 'up', 'right'] as const;
export const CHAR_FRAME_W = 16;
export const CHAR_FRAME_H = 32;
export const CHAR_FRAMES_PER_ROW = 7;
export const CHAR_COUNT = 6;

// ── Layout Persistence ──────────────────────────────────────
export const LAYOUT_DIR = '.pixel-agents';
export const LAYOUTS_SUBDIR = 'layouts';
export const LAYOUT_FILE_POLL_INTERVAL_MS = 2000;

// ── Server ──────────────────────────────────────────────────
export const DEFAULT_PORT = 3000;
export const WS_PATH = '/ws';

// ── Lobby ───────────────────────────────────────────────────
export const LOBBY_ROOM_WIDTH = 10;
export const LOBBY_ROOM_HEIGHT = 8;
export const LOBBY_CORRIDOR_WIDTH = 2;
export const LOBBY_MAX_ROOMS_PER_ROW = 4;
