import type { WebSocket } from 'ws';
import type { ClientMessage, RoomSummary } from '@pixel-agents/shared';
import type { WsBroadcaster, ClientConnection } from './wsBroadcaster.js';
import type { SessionScanner } from '../core/sessionScanner.js';
import { getRoomSummary, getAgentSnapshot } from '../core/projectManager.js';
import { readLayoutFromFile, writeLayoutToFile, writeSeatAssignments, readSeatAssignments } from '../persistence/layoutPersistence.js';

/** Validates that a projectHash contains only safe characters (alphanumeric, hyphens, underscores). */
function isValidProjectHash(hash: string): boolean {
	return typeof hash === 'string' && hash.length > 0 && hash.length < 256 && /^[a-zA-Z0-9_-]+$/.test(hash);
}

/** Basic validation that a layout object has required fields. */
function isValidLayout(layout: unknown): layout is Record<string, unknown> {
	return (
		typeof layout === 'object' &&
		layout !== null &&
		'version' in layout &&
		'tiles' in layout &&
		(layout as Record<string, unknown>).version === 1 &&
		Array.isArray((layout as Record<string, unknown>).tiles)
	);
}

function sendJson(ws: WebSocket, msg: unknown): void {
	if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function buildLobbyState(scanner: SessionScanner): RoomSummary[] {
	const rooms: RoomSummary[] = [];
	for (const project of scanner.getProjects().values()) {
		rooms.push(getRoomSummary(project));
	}
	return rooms;
}

export function handleWsConnection(
	ws: WebSocket,
	broadcaster: WsBroadcaster,
	scanner: SessionScanner,
): void {
	const conn: ClientConnection = broadcaster.addClient(ws);

	// Send initial lobby state
	sendJson(ws, { type: 'lobbyState', rooms: buildLobbyState(scanner) });

	ws.on('message', (raw: Buffer | string) => {
		let msg: ClientMessage;
		try {
			msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString());
		} catch {
			return;
		}

		switch (msg.type) {
			case 'joinRoom': {
				if (!isValidProjectHash(msg.projectHash)) break;
				conn.currentRoom = msg.projectHash;
				const project = scanner.getProject(msg.projectHash);
				if (project) {
					// Connect message sink for this room
					project.messageSink = broadcaster.createRoomSink(msg.projectHash);
					// Send full room state, including persisted seat data
					const seatData = readSeatAssignments(msg.projectHash);
					const agents = [...project.agents.values()].map((a) =>
						getAgentSnapshot(a, seatData?.[a.sessionId]),
					);
					const layout = readLayoutFromFile(msg.projectHash);
					sendJson(ws, {
						type: 'roomState',
						agents,
						layout,
					});
				}
				break;
			}
			case 'leaveRoom': {
				conn.currentRoom = null;
				sendJson(ws, {
					type: 'lobbyState',
					rooms: buildLobbyState(scanner),
				});
				break;
			}
			case 'saveLayout': {
				if (!isValidProjectHash(msg.projectHash)) break;
				if (!isValidLayout(msg.layout)) break;
				writeLayoutToFile(msg.projectHash, msg.layout as Record<string, unknown>);
				break;
			}
			case 'saveAgentSeats': {
				if (!isValidProjectHash(msg.projectHash)) break;
				writeSeatAssignments(msg.projectHash, msg.seats as Record<string, unknown>);
				break;
			}
		}
	});

	ws.on('close', () => {
		broadcaster.removeClient(conn);
	});
}
