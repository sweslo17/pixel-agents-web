import type { RoomSummary, AgentSnapshot, SeatMeta } from './types.js';

// Client -> Server
export type ClientMessage =
	| { type: 'joinRoom'; projectHash: string }
	| { type: 'leaveRoom' }
	| { type: 'saveLayout'; projectHash: string; layout: Record<string, unknown> }
	| { type: 'saveAgentSeats'; projectHash: string; seats: Record<string, SeatMeta> };

// Server -> Client (Lobby)
export type LobbyMessage =
	| { type: 'lobbyState'; rooms: RoomSummary[] }
	| { type: 'lobbyAgentUpdate'; projectHash: string; summary: RoomSummary }
	| { type: 'roomAppeared'; room: RoomSummary }
	| { type: 'roomDisappeared'; projectHash: string };

// Server -> Client (Global — sent regardless of lobby/room subscription)
export type GlobalMessage =
	| { type: 'newRoomNotification'; projectHash: string; displayName: string };

// Server -> Client (Room)
export type RoomMessage =
	| { type: 'roomState'; agents: AgentSnapshot[]; layout: Record<string, unknown> | null }
	| { type: 'agentCreated'; id: string }
	| { type: 'agentClosed'; id: string }
	| { type: 'agentStatus'; id: string; status: 'active' | 'waiting' }
	| { type: 'agentToolStart'; id: string; toolId: string; status: string }
	| { type: 'agentToolDone'; id: string; toolId: string }
	| { type: 'agentToolsClear'; id: string }
	| { type: 'agentToolPermission'; id: string }
	| { type: 'agentToolPermissionClear'; id: string }
	| { type: 'subagentToolStart'; id: string; parentToolId: string; toolId: string; status: string }
	| { type: 'subagentToolDone'; id: string; parentToolId: string; toolId: string }
	| { type: 'subagentClear'; id: string; parentToolId: string }
	| { type: 'subagentToolPermission'; id: string; parentToolId: string }
	| { type: 'layoutLoaded'; layout: Record<string, unknown> | null }
	| { type: 'settingsLoaded'; soundEnabled: boolean };

export type ServerMessage = LobbyMessage | RoomMessage | GlobalMessage;
