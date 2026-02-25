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
    return cache as { characters: unknown; floors: unknown; walls: unknown; furniture: unknown }
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
