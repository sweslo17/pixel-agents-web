import * as fs from 'fs';
import type { AgentState, AgentSnapshot, RoomSummary, MessageSink } from '@pixel-agents/shared';
import { startFileWatching, stopFileWatching, readNewLines } from '../claude/fileWatcher.js';
import { cancelWaitingTimer, cancelPermissionTimer } from '../claude/timerManager.js';

export interface ProjectState {
	projectHash: string;
	projectPath: string;
	displayName: string;
	agents: Map<string, AgentState>;
	fileWatchers: Map<string, fs.FSWatcher>;
	pollingTimers: Map<string, ReturnType<typeof setInterval>>;
	waitingTimers: Map<string, ReturnType<typeof setTimeout>>;
	permissionTimers: Map<string, ReturnType<typeof setTimeout>>;
	messageSink: MessageSink | null;
}

export function createProjectState(
	hash: string,
	projectPath: string,
	displayName: string,
): ProjectState {
	return {
		projectHash: hash,
		projectPath,
		displayName,
		agents: new Map(),
		fileWatchers: new Map(),
		pollingTimers: new Map(),
		waitingTimers: new Map(),
		permissionTimers: new Map(),
		messageSink: null,
	};
}

/**
 * Creates an AgentState for the given session, starts file watching,
 * and performs an initial read of any existing content.
 */
export function addAgent(
	project: ProjectState,
	sessionId: string,
	jsonlFile: string,
): void {
	const agent: AgentState = {
		id: sessionId,
		sessionId,
		projectDir: project.projectPath,
		jsonlFile,
		fileOffset: 0,
		lineBuffer: '',
		activeToolIds: new Set(),
		activeToolStatuses: new Map(),
		activeToolNames: new Map(),
		activeSubagentToolIds: new Map(),
		activeSubagentToolNames: new Map(),
		isWaiting: false,
		permissionSent: false,
		hadToolsInTurn: false,
		lastActivityTime: Date.now(),
	};

	project.agents.set(sessionId, agent);

	// Create a proxy sink that always delegates to the current project.messageSink.
	// This avoids the snapshot problem where startFileWatching captures a null sink
	// before a WebSocket client joins the room and sets it.
	const sinkProxy: MessageSink = {
		postMessage: (msg: unknown) => project.messageSink?.postMessage(msg),
	};

	// Start file watching with the project's shared maps
	startFileWatching(
		sessionId,
		jsonlFile,
		project.agents,
		project.fileWatchers,
		project.pollingTimers,
		project.waitingTimers,
		project.permissionTimers,
		sinkProxy,
	);

	// Do an initial read to catch up on any existing content
	readNewLines(
		sessionId,
		project.agents,
		project.waitingTimers,
		project.permissionTimers,
		sinkProxy,
	);
}

/**
 * Stops file watching, cleans up all timers, and removes the agent.
 */
export function removeAgent(
	project: ProjectState,
	sessionId: string,
): void {
	// Stop file watching (watcher + polling)
	stopFileWatching(sessionId, project.fileWatchers, project.pollingTimers);

	// Cancel any pending timers
	cancelWaitingTimer(sessionId, project.waitingTimers);
	cancelPermissionTimer(sessionId, project.permissionTimers);

	// Remove from agents map
	project.agents.delete(sessionId);
}

/**
 * Converts a runtime AgentState into a serializable AgentSnapshot
 * suitable for sending over the wire.
 */
export function getAgentSnapshot(agent: AgentState): AgentSnapshot {
	const activeTools: Array<{ toolId: string; status: string }> = [];
	for (const toolId of agent.activeToolIds) {
		const status = agent.activeToolStatuses.get(toolId) || '';
		activeTools.push({ toolId, status });
	}

	return {
		id: agent.id,
		isWaiting: agent.isWaiting,
		activeTools,
	};
}

/**
 * Builds a RoomSummary from the current ProjectState.
 */
export function getRoomSummary(project: ProjectState): RoomSummary {
	const agentSummaries = [...project.agents.values()].map(agent => {
		// Pick the first active tool name as currentTool, or null
		let currentTool: string | null = null;
		if (agent.activeToolIds.size > 0) {
			const firstToolId = agent.activeToolIds.values().next().value;
			if (firstToolId !== undefined) {
				currentTool = agent.activeToolStatuses.get(firstToolId) || null;
			}
		}

		return {
			id: agent.id,
			isActive: agent.activeToolIds.size > 0 || !agent.isWaiting,
			isWaiting: agent.isWaiting,
			currentTool,
		};
	});

	let lastActivityTime = 0;
	for (const agent of project.agents.values()) {
		if (agent.lastActivityTime > lastActivityTime) {
			lastActivityTime = agent.lastActivityTime;
		}
	}

	return {
		projectHash: project.projectHash,
		displayName: project.displayName,
		projectPath: project.projectPath,
		activeAgentCount: project.agents.size,
		agentSummaries,
		lastActivityTime,
	};
}

/**
 * Sets or clears the WebSocket message broadcaster for this project.
 */
export function setMessageSink(
	project: ProjectState,
	sink: MessageSink | null,
): void {
	project.messageSink = sink;
}
