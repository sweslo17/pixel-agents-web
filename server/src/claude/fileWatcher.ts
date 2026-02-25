import * as fs from 'fs';
import type { AgentState, MessageSink } from '@pixel-agents/shared';
import { FILE_WATCHER_POLL_INTERVAL_MS } from '@pixel-agents/shared';
import { cancelWaitingTimer, cancelPermissionTimer } from './timerManager.js';
import { processTranscriptLine } from './transcriptParser.js';

export function startFileWatching(
	agentId: string,
	filePath: string,
	agents: Map<string, AgentState>,
	fileWatchers: Map<string, fs.FSWatcher>,
	pollingTimers: Map<string, ReturnType<typeof setInterval>>,
	waitingTimers: Map<string, ReturnType<typeof setTimeout>>,
	permissionTimers: Map<string, ReturnType<typeof setTimeout>>,
	messageSink: MessageSink | undefined,
): void {
	// Primary: fs.watch
	try {
		const watcher = fs.watch(filePath, () => {
			readNewLines(agentId, agents, waitingTimers, permissionTimers, messageSink);
		});
		fileWatchers.set(agentId, watcher);
	} catch (e) {
		console.log(`[Pixel Agents] fs.watch failed for agent ${agentId}: ${e}`);
	}

	// Backup: poll every 2s
	const interval = setInterval(() => {
		if (!agents.has(agentId)) { clearInterval(interval); return; }
		readNewLines(agentId, agents, waitingTimers, permissionTimers, messageSink);
	}, FILE_WATCHER_POLL_INTERVAL_MS);
	pollingTimers.set(agentId, interval);
}

export function readNewLines(
	agentId: string,
	agents: Map<string, AgentState>,
	waitingTimers: Map<string, ReturnType<typeof setTimeout>>,
	permissionTimers: Map<string, ReturnType<typeof setTimeout>>,
	messageSink: MessageSink | undefined,
): void {
	const agent = agents.get(agentId);
	if (!agent) return;
	try {
		const stat = fs.statSync(agent.jsonlFile);
		if (stat.size <= agent.fileOffset) return;

		const buf = Buffer.alloc(stat.size - agent.fileOffset);
		const fd = fs.openSync(agent.jsonlFile, 'r');
		fs.readSync(fd, buf, 0, buf.length, agent.fileOffset);
		fs.closeSync(fd);
		agent.fileOffset = stat.size;

		const text = agent.lineBuffer + buf.toString('utf-8');
		const lines = text.split('\n');
		agent.lineBuffer = lines.pop() || '';

		const hasLines = lines.some(l => l.trim());
		if (hasLines) {
			// New data arriving — cancel timers (data flowing means agent is still active)
			cancelWaitingTimer(agentId, waitingTimers);
			cancelPermissionTimer(agentId, permissionTimers);
			if (agent.permissionSent) {
				agent.permissionSent = false;
				messageSink?.postMessage({ type: 'agentToolPermissionClear', id: agentId });
			}
		}

		for (const line of lines) {
			if (!line.trim()) continue;
			processTranscriptLine(agentId, line, agents, waitingTimers, permissionTimers, messageSink);
		}
	} catch (e) {
		console.log(`[Pixel Agents] Read error for agent ${agentId}: ${e}`);
	}
}

export function stopFileWatching(
	agentId: string,
	fileWatchers: Map<string, fs.FSWatcher>,
	pollingTimers: Map<string, ReturnType<typeof setInterval>>,
): void {
	const watcher = fileWatchers.get(agentId);
	if (watcher) {
		watcher.close();
		fileWatchers.delete(agentId);
	}

	const interval = pollingTimers.get(agentId);
	if (interval) {
		clearInterval(interval);
		pollingTimers.delete(agentId);
	}
}
