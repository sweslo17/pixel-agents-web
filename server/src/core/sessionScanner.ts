import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PROJECT_SCAN_INTERVAL_MS, SESSION_INACTIVE_THRESHOLD_MS } from '@pixel-agents/shared';
import { computeDisplayNames, reverseProjectHash } from './displayNames.js';
import { createProjectState, addAgent, removeAgent, type ProjectState } from './projectManager.js';

export interface ScannerCallbacks {
	onRoomAppeared: (project: ProjectState) => void;
	onRoomDisappeared: (hash: string) => void;
	onAgentAppeared: (hash: string, sessionId: string) => void;
	onAgentDisappeared: (hash: string, sessionId: string) => void;
}

/**
 * Periodically scans ~/.claude/projects/ for active Claude Code sessions.
 * Discovers project directories, tracks active JSONL files, and notifies
 * via callbacks when rooms/agents appear or disappear.
 */
export class SessionScanner {
	private projects = new Map<string, ProjectState>();
	private scanTimer: ReturnType<typeof setInterval> | null = null;
	private callbacks: ScannerCallbacks;

	constructor(callbacks: ScannerCallbacks) {
		this.callbacks = callbacks;
	}

	start(): void {
		this.scan();
		this.scanTimer = setInterval(() => this.scan(), PROJECT_SCAN_INTERVAL_MS);
	}

	stop(): void {
		if (this.scanTimer) {
			clearInterval(this.scanTimer);
			this.scanTimer = null;
		}

		// Clean up all project watchers and agents
		for (const project of this.projects.values()) {
			for (const sessionId of [...project.agents.keys()]) {
				removeAgent(project, sessionId);
			}
		}
		this.projects.clear();
	}

	getProjects(): Map<string, ProjectState> {
		return this.projects;
	}

	getProject(hash: string): ProjectState | undefined {
		return this.projects.get(hash);
	}

	private scan(): void {
		const claudeProjectsDir = path.join(os.homedir(), '.claude', 'projects');
		if (!fs.existsSync(claudeProjectsDir)) return;

		const now = Date.now();
		const currentHashes = new Set<string>();

		// 1. Scan all project directories
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(claudeProjectsDir, { withFileTypes: true });
		} catch {
			return;
		}

		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const hash = entry.name;
			currentHashes.add(hash);
			const projectDir = path.join(claudeProjectsDir, hash);

			// 2. Scan JSONL files in this project
			let jsonlFiles: string[];
			try {
				jsonlFiles = fs.readdirSync(projectDir)
					.filter(f => f.endsWith('.jsonl'));
			} catch {
				continue;
			}

			// 3. Check which sessions are active (modified within threshold)
			const activeSessions = new Map<string, string>(); // sessionId -> filePath
			for (const file of jsonlFiles) {
				const filePath = path.join(projectDir, file);
				try {
					const stat = fs.statSync(filePath);
					if (now - stat.mtimeMs < SESSION_INACTIVE_THRESHOLD_MS) {
						const sessionId = file.replace('.jsonl', '');
						activeSessions.set(sessionId, filePath);
					}
				} catch {
					continue;
				}
			}

			// 4. Create or update project state
			let project = this.projects.get(hash);

			if (activeSessions.size > 0 && !project) {
				// New project with active sessions
				const projectPath = reverseProjectHash(hash);
				project = createProjectState(hash, projectPath, hash); // displayName updated below
				this.projects.set(hash, project);
				this.callbacks.onRoomAppeared(project);
			}

			if (project) {
				// Add new agents
				for (const [sessionId, filePath] of activeSessions) {
					if (!project.agents.has(sessionId)) {
						addAgent(project, sessionId, filePath);
						this.callbacks.onAgentAppeared(hash, sessionId);
					}
				}

				// Remove inactive agents
				for (const sessionId of [...project.agents.keys()]) {
					if (!activeSessions.has(sessionId)) {
						removeAgent(project, sessionId);
						this.callbacks.onAgentDisappeared(hash, sessionId);
					}
				}

				// If project has no more agents, remove it
				if (project.agents.size === 0) {
					this.projects.delete(hash);
					this.callbacks.onRoomDisappeared(hash);
				}
			}
		}

		// 5. Remove projects whose directories no longer exist
		for (const hash of [...this.projects.keys()]) {
			if (!currentHashes.has(hash)) {
				const project = this.projects.get(hash)!;
				for (const sessionId of [...project.agents.keys()]) {
					removeAgent(project, sessionId);
				}
				this.projects.delete(hash);
				this.callbacks.onRoomDisappeared(hash);
			}
		}

		// 6. Recompute display names across all active projects
		this.recomputeDisplayNames();
	}

	private recomputeDisplayNames(): void {
		const paths = [...this.projects.values()].map(p => p.projectPath);
		const nameMap = computeDisplayNames(paths);
		for (const project of this.projects.values()) {
			project.displayName = nameMap.get(project.projectPath) || project.projectHash;
		}
	}
}
