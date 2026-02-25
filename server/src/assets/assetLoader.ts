/**
 * Asset Loader - Loads furniture assets from disk at startup
 *
 * Reads assets/furniture/furniture-catalog.json and loads all PNG files
 * into SpriteData format. Pure data loaders with no VS Code dependencies.
 */

import * as fs from 'fs';
import * as path from 'path';
import { PNG } from 'pngjs';
import {
	PNG_ALPHA_THRESHOLD,
	WALL_PIECE_WIDTH,
	WALL_PIECE_HEIGHT,
	WALL_GRID_COLS,
	WALL_BITMASK_COUNT,
	FLOOR_PATTERN_COUNT,
	FLOOR_TILE_SIZE,
	CHARACTER_DIRECTIONS,
	CHAR_FRAME_W,
	CHAR_FRAME_H,
	CHAR_FRAMES_PER_ROW,
	CHAR_COUNT,
} from '@pixel-agents/shared';

export interface FurnitureAsset {
	id: string;
	name: string;
	label: string;
	category: string;
	file: string;
	width: number;
	height: number;
	footprintW: number;
	footprintH: number;
	isDesk: boolean;
	canPlaceOnWalls: boolean;
	partOfGroup?: boolean;
	groupId?: string;
	canPlaceOnSurfaces?: boolean;
	backgroundTiles?: number;
	orientation?: string;
	state?: string;
}

export interface LoadedAssets {
	catalog: FurnitureAsset[];
	sprites: Record<string, string[][]>;
}

/**
 * Load furniture assets from disk.
 * Returns catalog + sprites as a plain Record (JSON-serializable).
 */
export async function loadFurnitureAssets(
	assetsRoot: string,
): Promise<LoadedAssets | null> {
	try {
		console.log(`[AssetLoader] assetsRoot received: "${assetsRoot}"`);
		const catalogPath = path.join(assetsRoot, 'furniture', 'furniture-catalog.json');
		console.log(`[AssetLoader] Attempting to load from: ${catalogPath}`);

		if (!fs.existsSync(catalogPath)) {
			console.log('[AssetLoader] No furniture catalog found at:', catalogPath);
			return null;
		}

		console.log('[AssetLoader] Loading furniture assets from:', catalogPath);

		const catalogContent = fs.readFileSync(catalogPath, 'utf-8');
		const catalogData = JSON.parse(catalogContent) as { assets?: FurnitureAsset[] };
		const catalog: FurnitureAsset[] = catalogData.assets || [];

		const sprites: Record<string, string[][]> = {};

		for (const asset of catalog) {
			try {
				// Resolve asset file path relative to assetsRoot
				let filePath = asset.file;
				// Strip leading 'assets/' if present — assetsRoot already points at the assets dir
				if (filePath.startsWith('assets/')) {
					filePath = filePath.slice('assets/'.length);
				}
				const assetPath = path.join(assetsRoot, filePath);

				if (!fs.existsSync(assetPath)) {
					console.warn(`  Asset file not found: ${asset.file}`);
					continue;
				}

				// Read PNG and convert to SpriteData
				const pngBuffer = fs.readFileSync(assetPath);
				const spriteData = pngToSpriteData(pngBuffer, asset.width, asset.height);

				sprites[asset.id] = spriteData;
			} catch (err) {
				console.warn(`  Error loading ${asset.id}: ${err instanceof Error ? err.message : err}`);
			}
		}

		console.log(`  Loaded ${Object.keys(sprites).length} / ${catalog.length} assets`);
		return { catalog, sprites };
	} catch (err) {
		console.error(`[AssetLoader] Error loading furniture assets: ${err instanceof Error ? err.message : err}`);
		return null;
	}
}

/**
 * Convert PNG buffer to SpriteData (2D array of hex color strings)
 *
 * PNG format: RGBA
 * SpriteData format: string[][] where '' = transparent, '#RRGGBB' = opaque color
 */
export function pngToSpriteData(pngBuffer: Buffer, width: number, height: number): string[][] {
	try {
		const png = PNG.sync.read(pngBuffer);

		if (png.width !== width || png.height !== height) {
			console.warn(
				`PNG dimensions mismatch: expected ${width}x${height}, got ${png.width}x${png.height}`,
			);
		}

		const sprite: string[][] = [];
		const data = png.data;

		for (let y = 0; y < height; y++) {
			const row: string[] = [];
			for (let x = 0; x < width; x++) {
				const pixelIndex = (y * png.width + x) * 4;

				const r = data[pixelIndex];
				const g = data[pixelIndex + 1];
				const b = data[pixelIndex + 2];
				const a = data[pixelIndex + 3];

				if (a < PNG_ALPHA_THRESHOLD) {
					row.push('');
				} else {
					const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
					row.push(hex);
				}
			}
			sprite.push(row);
		}

		return sprite;
	} catch (err) {
		console.warn(`Failed to parse PNG: ${err instanceof Error ? err.message : err}`);
		// Return transparent placeholder
		const sprite: string[][] = [];
		for (let y = 0; y < height; y++) {
			sprite.push(new Array(width).fill('') as string[]);
		}
		return sprite;
	}
}

// ── Default layout loading ───────────────────────────────────

/**
 * Load the bundled default layout from assets/default-layout.json.
 * Returns the parsed layout object or null if not found.
 */
export function loadDefaultLayout(assetsRoot: string): Record<string, unknown> | null {
	try {
		const layoutPath = path.join(assetsRoot, 'default-layout.json');
		if (!fs.existsSync(layoutPath)) {
			console.log('[AssetLoader] No default-layout.json found at:', layoutPath);
			return null;
		}
		const content = fs.readFileSync(layoutPath, 'utf-8');
		const layout = JSON.parse(content) as Record<string, unknown>;
		console.log(`[AssetLoader] Loaded default layout (${layout.cols}x${layout.rows})`);
		return layout;
	} catch (err) {
		console.error(`[AssetLoader] Error loading default layout: ${err instanceof Error ? err.message : err}`);
		return null;
	}
}

// ── Wall tile loading ────────────────────────────────────────

/**
 * Load wall tiles from walls.png (64x128, 4x4 grid of 16x32 pieces).
 * Piece at bitmask M: col = M % 4, row = floor(M / 4).
 * Returns array of 16 sprite data arrays (indexed by bitmask).
 */
export async function loadWallTiles(
	assetsRoot: string,
): Promise<string[][][] | null> {
	try {
		const wallPath = path.join(assetsRoot, 'walls.png');
		if (!fs.existsSync(wallPath)) {
			console.log('[AssetLoader] No walls.png found at:', wallPath);
			return null;
		}

		console.log('[AssetLoader] Loading wall tiles from:', wallPath);
		const pngBuffer = fs.readFileSync(wallPath);
		const png = PNG.sync.read(pngBuffer);

		const sprites: string[][][] = [];
		for (let mask = 0; mask < WALL_BITMASK_COUNT; mask++) {
			const ox = (mask % WALL_GRID_COLS) * WALL_PIECE_WIDTH;
			const oy = Math.floor(mask / WALL_GRID_COLS) * WALL_PIECE_HEIGHT;
			const sprite: string[][] = [];
			for (let r = 0; r < WALL_PIECE_HEIGHT; r++) {
				const row: string[] = [];
				for (let c = 0; c < WALL_PIECE_WIDTH; c++) {
					const idx = ((oy + r) * png.width + (ox + c)) * 4;
					const rv = png.data[idx];
					const gv = png.data[idx + 1];
					const bv = png.data[idx + 2];
					const av = png.data[idx + 3];
					if (av < PNG_ALPHA_THRESHOLD) {
						row.push('');
					} else {
						row.push(`#${rv.toString(16).padStart(2, '0')}${gv.toString(16).padStart(2, '0')}${bv.toString(16).padStart(2, '0')}`.toUpperCase());
					}
				}
				sprite.push(row);
			}
			sprites.push(sprite);
		}

		console.log(`[AssetLoader] Loaded ${sprites.length} wall tile pieces`);
		return sprites;
	} catch (err) {
		console.error(`[AssetLoader] Error loading wall tiles: ${err instanceof Error ? err.message : err}`);
		return null;
	}
}

// ── Floor tile loading ───────────────────────────────────────

/**
 * Load floor tile patterns from floors.png (7 tiles, 16px each, horizontal strip).
 * Returns array of 7 sprite data arrays.
 */
export async function loadFloorTiles(
	assetsRoot: string,
): Promise<string[][][] | null> {
	try {
		const floorPath = path.join(assetsRoot, 'floors.png');
		if (!fs.existsSync(floorPath)) {
			console.log('[AssetLoader] No floors.png found at:', floorPath);
			return null;
		}

		console.log('[AssetLoader] Loading floor tiles from:', floorPath);
		const pngBuffer = fs.readFileSync(floorPath);
		const png = PNG.sync.read(pngBuffer);
		const sprites: string[][][] = [];
		for (let t = 0; t < FLOOR_PATTERN_COUNT; t++) {
			const sprite: string[][] = [];
			for (let y = 0; y < FLOOR_TILE_SIZE; y++) {
				const row: string[] = [];
				for (let x = 0; x < FLOOR_TILE_SIZE; x++) {
					const px = t * FLOOR_TILE_SIZE + x;
					const idx = (y * png.width + px) * 4;
					const r = png.data[idx];
					const g = png.data[idx + 1];
					const b = png.data[idx + 2];
					const a = png.data[idx + 3];
					if (a < PNG_ALPHA_THRESHOLD) {
						row.push('');
					} else {
						row.push(`#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase());
					}
				}
				sprite.push(row);
			}
			sprites.push(sprite);
		}

		console.log(`[AssetLoader] Loaded ${sprites.length} floor tile patterns`);
		return sprites;
	} catch (err) {
		console.error(`[AssetLoader] Error loading floor tiles: ${err instanceof Error ? err.message : err}`);
		return null;
	}
}

// ── Character sprite loading ────────────────────────────────

export interface CharacterDirectionSprites {
	down: string[][][];
	up: string[][][];
	right: string[][][];
}

export interface LoadedCharacterSprites {
	/** 6 pre-colored characters, each with 7 frames per direction */
	characters: CharacterDirectionSprites[];
}

/**
 * Load pre-colored character sprites from assets/characters/ (6 PNGs, each 112x96).
 * Each PNG has 3 direction rows (down, up, right) x 7 frames (16x32 each).
 * Returns the character sprites structure.
 */
export async function loadCharacterSprites(
	assetsRoot: string,
): Promise<LoadedCharacterSprites | null> {
	try {
		const charDir = path.join(assetsRoot, 'characters');
		const characters: CharacterDirectionSprites[] = [];

		for (let ci = 0; ci < CHAR_COUNT; ci++) {
			const filePath = path.join(charDir, `char_${ci}.png`);
			if (!fs.existsSync(filePath)) {
				console.log(`[AssetLoader] No character sprite found at: ${filePath}`);
				return null;
			}

			const pngBuffer = fs.readFileSync(filePath);
			const png = PNG.sync.read(pngBuffer);

			const directions = CHARACTER_DIRECTIONS;
			const charData: CharacterDirectionSprites = { down: [], up: [], right: [] };

			for (let dirIdx = 0; dirIdx < directions.length; dirIdx++) {
				const dir = directions[dirIdx];
				const rowOffsetY = dirIdx * CHAR_FRAME_H;
				const frames: string[][][] = [];

				for (let f = 0; f < CHAR_FRAMES_PER_ROW; f++) {
					const sprite: string[][] = [];
					const frameOffsetX = f * CHAR_FRAME_W;
					for (let y = 0; y < CHAR_FRAME_H; y++) {
						const row: string[] = [];
						for (let x = 0; x < CHAR_FRAME_W; x++) {
							const idx = (((rowOffsetY + y) * png.width) + (frameOffsetX + x)) * 4;
							const r = png.data[idx];
							const g = png.data[idx + 1];
							const b = png.data[idx + 2];
							const a = png.data[idx + 3];
							if (a < PNG_ALPHA_THRESHOLD) {
								row.push('');
							} else {
								row.push(`#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase());
							}
						}
						sprite.push(row);
					}
					frames.push(sprite);
				}
				charData[dir] = frames;
			}
			characters.push(charData);
		}

		console.log(`[AssetLoader] Loaded ${characters.length} character sprites (${CHAR_FRAMES_PER_ROW} frames x 3 directions each)`);
		return { characters };
	} catch (err) {
		console.error(`[AssetLoader] Error loading character sprites: ${err instanceof Error ? err.message : err}`);
		return null;
	}
}
