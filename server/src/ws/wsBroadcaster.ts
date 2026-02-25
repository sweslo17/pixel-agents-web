import type { WebSocket } from 'ws';
import type { MessageSink, ServerMessage } from '@pixel-agents/shared';

export interface ClientConnection {
	ws: WebSocket;
	currentRoom: string | null; // projectHash or null = lobby
}

export class WsBroadcaster {
	private clients = new Set<ClientConnection>();

	addClient(ws: WebSocket): ClientConnection {
		const conn: ClientConnection = { ws, currentRoom: null };
		this.clients.add(conn);
		return conn;
	}

	removeClient(conn: ClientConnection): void {
		this.clients.delete(conn);
	}

	broadcastLobby(msg: ServerMessage): void {
		const data = JSON.stringify(msg);
		for (const client of this.clients) {
			if (client.currentRoom === null && client.ws.readyState === 1) {
				client.ws.send(data);
			}
		}
	}

	/** Send to ALL connected clients regardless of lobby/room subscription */
	broadcastAll(msg: ServerMessage): void {
		const data = JSON.stringify(msg);
		for (const client of this.clients) {
			if (client.ws.readyState === 1) {
				client.ws.send(data);
			}
		}
	}

	broadcastRoom(projectHash: string, msg: ServerMessage): void {
		const data = JSON.stringify(msg);
		for (const client of this.clients) {
			if (client.currentRoom === projectHash && client.ws.readyState === 1) {
				client.ws.send(data);
			}
		}
	}

	/** Create a MessageSink that broadcasts to a specific room */
	createRoomSink(projectHash: string): MessageSink {
		return {
			postMessage: (msg: unknown) =>
				this.broadcastRoom(projectHash, msg as ServerMessage),
		};
	}
}
