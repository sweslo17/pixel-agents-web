import type { FastifyInstance } from 'fastify';
import { loadCharacterSprites, loadFloorTiles, loadWallTiles, loadFurnitureAssets } from '../assets/assetLoader.js';
import type { LoadedAssets, LoadedCharacterSprites } from '../assets/assetLoader.js';

let cachedAssets: {
	characters: LoadedCharacterSprites | null;
	floors: string[][][] | null;
	walls: string[][][] | null;
	furniture: LoadedAssets | null;
} | null = null;

async function ensureLoaded(assetsDir: string): Promise<NonNullable<typeof cachedAssets>> {
	if (cachedAssets) return cachedAssets;
	const characters = await loadCharacterSprites(assetsDir);
	const floors = await loadFloorTiles(assetsDir);
	const walls = await loadWallTiles(assetsDir);
	const furniture = await loadFurnitureAssets(assetsDir);
	cachedAssets = { characters, floors, walls, furniture };
	return cachedAssets;
}

export async function registerAssetRoutes(
	app: FastifyInstance,
	assetsDir: string,
): Promise<void> {
	app.get('/api/assets/characters', async () => {
		const assets = await ensureLoaded(assetsDir);
		return assets.characters;
	});

	app.get('/api/assets/floors', async () => {
		const assets = await ensureLoaded(assetsDir);
		return assets.floors;
	});

	app.get('/api/assets/walls', async () => {
		const assets = await ensureLoaded(assetsDir);
		return assets.walls;
	});

	app.get('/api/assets/furniture', async () => {
		const assets = await ensureLoaded(assetsDir);
		return assets.furniture;
	});
}
