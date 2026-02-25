/**
 * Layout Persistence - Per-project layout file I/O
 *
 * Stores layouts at ~/.pixel-agents/layouts/<projectHash>.json
 * No VS Code dependencies — pure Node.js file operations.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
	LAYOUT_DIR,
	LAYOUTS_SUBDIR,
	LAYOUT_FILE_POLL_INTERVAL_MS,
} from '@pixel-agents/shared';

export interface LayoutWatcher {
	markOwnWrite(): void;
	dispose(): void;
}

/**
 * Get the path to a project's layout file.
 */
export function getLayoutFilePath(projectHash: string): string {
	return path.join(os.homedir(), LAYOUT_DIR, LAYOUTS_SUBDIR, projectHash + '.json');
}

/**
 * Read a per-project layout from file.
 * Returns the parsed layout object or null if not found / invalid.
 */
export function readLayoutFromFile(projectHash: string): Record<string, unknown> | null {
	const filePath = getLayoutFilePath(projectHash);
	try {
		if (!fs.existsSync(filePath)) return null;
		const raw = fs.readFileSync(filePath, 'utf-8');
		return JSON.parse(raw) as Record<string, unknown>;
	} catch (err) {
		console.error('[Pixel Agents] Failed to read layout file:', err);
		return null;
	}
}

/**
 * Write a per-project layout to file (atomic via .tmp + rename).
 */
export function writeLayoutToFile(projectHash: string, layout: Record<string, unknown>): void {
	const filePath = getLayoutFilePath(projectHash);
	const dir = path.dirname(filePath);
	try {
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
		const json = JSON.stringify(layout, null, 2);
		const tmpPath = filePath + '.tmp';
		fs.writeFileSync(tmpPath, json, 'utf-8');
		fs.renameSync(tmpPath, filePath);
	} catch (err) {
		console.error('[Pixel Agents] Failed to write layout file:', err);
	}
}

/**
 * Load layout for a project:
 * 1. If per-project file exists -> return it
 * 2. Else if defaultLayout provided -> write to file, return it
 * 3. Else -> return null
 */
export function loadLayout(
	projectHash: string,
	defaultLayout: Record<string, unknown> | null,
): Record<string, unknown> | null {
	// 1. Try file
	const fromFile = readLayoutFromFile(projectHash);
	if (fromFile) {
		console.log(`[Pixel Agents] Layout loaded from file for project ${projectHash}`);
		return fromFile;
	}

	// 2. Use bundled default
	if (defaultLayout) {
		console.log(`[Pixel Agents] Writing bundled default layout to file for project ${projectHash}`);
		writeLayoutToFile(projectHash, defaultLayout);
		return defaultLayout;
	}

	// 3. Nothing
	return null;
}

/**
 * Get the path to a project's seat assignments file.
 */
function getSeatFilePath(projectHash: string): string {
	return path.join(os.homedir(), LAYOUT_DIR, LAYOUTS_SUBDIR, projectHash + '.seats.json');
}

/**
 * Read persisted seat assignments for a project.
 * Returns a map of sessionId -> { palette, hueShift, seatId }.
 */
export function readSeatAssignments(projectHash: string): Record<string, unknown> | null {
	const filePath = getSeatFilePath(projectHash);
	try {
		if (!fs.existsSync(filePath)) return null;
		const raw = fs.readFileSync(filePath, 'utf-8');
		return JSON.parse(raw) as Record<string, unknown>;
	} catch {
		return null;
	}
}

/**
 * Write seat assignments for a project (atomic via .tmp + rename).
 */
export function writeSeatAssignments(projectHash: string, seats: Record<string, unknown>): void {
	const filePath = getSeatFilePath(projectHash);
	const dir = path.dirname(filePath);
	try {
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
		const json = JSON.stringify(seats, null, 2);
		const tmpPath = filePath + '.tmp';
		fs.writeFileSync(tmpPath, json, 'utf-8');
		fs.renameSync(tmpPath, filePath);
	} catch (err) {
		console.error('[Pixel Agents] Failed to write seat assignments:', err);
	}
}

/**
 * Watch a per-project layout file for external changes.
 * Uses hybrid fs.watch + polling (same pattern as JSONL watching).
 */
export function watchLayoutFile(
	projectHash: string,
	onExternalChange: (layout: Record<string, unknown>) => void,
): LayoutWatcher {
	const filePath = getLayoutFilePath(projectHash);
	let skipNextChange = false;
	let lastMtime = 0;
	let fsWatcher: fs.FSWatcher | null = null;
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let disposed = false;

	// Initialize lastMtime
	try {
		if (fs.existsSync(filePath)) {
			lastMtime = fs.statSync(filePath).mtimeMs;
		}
	} catch { /* ignore */ }

	function checkForChange(): void {
		if (disposed) return;
		try {
			if (!fs.existsSync(filePath)) return;
			const stat = fs.statSync(filePath);
			if (stat.mtimeMs <= lastMtime) return;
			lastMtime = stat.mtimeMs;

			if (skipNextChange) {
				skipNextChange = false;
				return;
			}

			const raw = fs.readFileSync(filePath, 'utf-8');
			const layout = JSON.parse(raw) as Record<string, unknown>;
			console.log(`[Pixel Agents] External layout change detected for project ${projectHash}`);
			onExternalChange(layout);
		} catch (err) {
			console.error('[Pixel Agents] Error checking layout file:', err);
		}
	}

	function startFsWatch(): void {
		if (disposed || fsWatcher) return;
		try {
			if (!fs.existsSync(filePath)) return;
			fsWatcher = fs.watch(filePath, () => {
				checkForChange();
			});
			fsWatcher.on('error', () => {
				// fs.watch can be unreliable -- polling backup handles it
				fsWatcher?.close();
				fsWatcher = null;
			});
		} catch {
			// File may not exist yet -- polling will retry
		}
	}

	// Start fs.watch if file exists
	startFsWatch();

	// Polling backup (also starts fs.watch if file appears)
	pollTimer = setInterval(() => {
		if (disposed) return;
		if (!fsWatcher) {
			startFsWatch();
		}
		checkForChange();
	}, LAYOUT_FILE_POLL_INTERVAL_MS);

	return {
		markOwnWrite(): void {
			skipNextChange = true;
			// Update lastMtime preemptively so a near-instant poll doesn't miss the flag
			try {
				if (fs.existsSync(filePath)) {
					lastMtime = fs.statSync(filePath).mtimeMs;
				}
			} catch { /* ignore */ }
		},
		dispose(): void {
			disposed = true;
			fsWatcher?.close();
			fsWatcher = null;
			if (pollTimer) {
				clearInterval(pollTimer);
				pollTimer = null;
			}
		},
	};
}
