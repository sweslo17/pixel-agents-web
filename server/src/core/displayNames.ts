import * as fs from 'fs';

/**
 * Given a list of absolute filesystem paths, compute the shortest unique
 * suffix for each. Start from the last path segment; if any names collide,
 * expand ALL colliding names by one more parent segment. Repeat until all
 * names are unique.
 */
export function computeDisplayNames(paths: string[]): Map<string, string> {
	const result = new Map<string, string>();
	if (paths.length === 0) return result;

	// Track how many segments each path is currently showing
	const segmentCounts = new Map<string, number>();
	for (const p of paths) {
		segmentCounts.set(p, 1);
	}

	const getSegments = (p: string): string[] => {
		// Split and filter empty segments (leading slash produces empty first element)
		return p.split('/').filter(s => s.length > 0);
	};

	const getSuffix = (p: string, count: number): string => {
		const segments = getSegments(p);
		const start = Math.max(0, segments.length - count);
		return segments.slice(start).join('/');
	};

	// Iteratively expand colliding names
	let hasCollision = true;
	while (hasCollision) {
		hasCollision = false;

		// Build current name -> list of paths with that name
		const nameToPathsMap = new Map<string, string[]>();
		for (const p of paths) {
			const count = segmentCounts.get(p)!;
			const name = getSuffix(p, count);
			const list = nameToPathsMap.get(name);
			if (list) {
				list.push(p);
			} else {
				nameToPathsMap.set(name, [p]);
			}
		}

		// Expand all colliding groups
		for (const [, collisionPaths] of nameToPathsMap) {
			if (collisionPaths.length > 1) {
				hasCollision = true;
				for (const p of collisionPaths) {
					const segments = getSegments(p);
					const current = segmentCounts.get(p)!;
					// Don't exceed total segment count
					segmentCounts.set(p, Math.min(current + 1, segments.length));
				}
			}
		}
	}

	// Build final result
	for (const p of paths) {
		const count = segmentCounts.get(p)!;
		result.set(p, getSuffix(p, count));
	}

	return result;
}

/**
 * Claude Code hashes project paths by replacing ':', '\', '/' with '-'.
 * On macOS/Linux paths start with '/', so the hash starts with '-'.
 * This function attempts to reverse that hash back to a filesystem path.
 *
 * The reversal is inherently ambiguous because original hyphens in the path
 * are indistinguishable from replaced separators. We use heuristics:
 * 1. Replace leading '-' with '/' (macOS/Linux absolute path)
 * 2. Check if the result exists on disk
 * 3. If not, try reconstructing by splitting on '-' and probing with '/'
 * 4. Fall back to the raw hash
 */
export function reverseProjectHash(hash: string): string {
	if (!hash) return hash;

	// Step 1: Replace leading '-' with '/' for macOS/Linux absolute paths
	let candidate = hash.startsWith('-') ? '/' + hash.slice(1) : hash;

	// Quick check: if the naive replacement happens to be valid, return it
	if (fs.existsSync(candidate)) return candidate;

	// Step 2: Heuristic reconstruction.
	// Split on '-' and try replacing dashes with '/' from left to right,
	// keeping the longest prefix that exists on disk.
	const parts = candidate.split('-');
	if (parts.length <= 1) return candidate;

	// Greedy approach: try building the path by choosing '/' or '-' at each junction.
	// We greedily pick '/' when the resulting prefix exists as a directory.
	let bestPath = parts[0];
	for (let i = 1; i < parts.length; i++) {
		const withSlash = bestPath + '/' + parts[i];
		const withDash = bestPath + '-' + parts[i];

		// Prefer '/' if the prefix so far is a valid directory
		if (i < parts.length - 1) {
			// Not the last segment: check if prefix is a directory
			if (fs.existsSync(withSlash)) {
				bestPath = withSlash;
			} else {
				bestPath = withDash;
			}
		} else {
			// Last segment: check if the full path exists (file or directory)
			if (fs.existsSync(withSlash)) {
				bestPath = withSlash;
			} else if (fs.existsSync(withDash)) {
				bestPath = withDash;
			} else {
				// Neither exists; prefer '/' as it's the more common separator
				bestPath = withSlash;
			}
		}
	}

	if (fs.existsSync(bestPath)) return bestPath;

	// Final fallback: return the raw hash
	return hash;
}
