import type { WebSocket } from 'ws';
import type { ClientMessage, RoomSummary } from '@pixel-agents/shared';
import type { WsBroadcaster, ClientConnection } from './wsBroadcaster.js';
import type { SessionScanner } from '../core/sessionScanner.js';
import { getRoomSummary, getAgentSnapshot } from '../core/projectManager.js';
import { readLayoutFromFile, writeLayoutToFile } from '../persistence/layoutPersistence.js';

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
				conn.currentRoom = msg.projectHash;
				const project = scanner.getProject(msg.projectHash);
				if (project) {
					// Connect message sink for this room
					project.messageSink = broadcaster.createRoomSink(msg.projectHash);
					// Send full room state
					const agents = [...project.agents.values()].map((a) =>
						getAgentSnapshot(a),
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
				writeLayoutToFile(msg.projectHash, msg.layout);
				break;
			}
			case 'saveAgentSeats': {
				// TODO: persist seat assignments
				break;
			}
		}
	});

	ws.on('close', () => {
		broadcaster.removeClient(conn);
	});
}
