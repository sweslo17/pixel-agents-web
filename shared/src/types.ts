export interface AgentState {
	id: string;
	sessionId: string;
	projectDir: string;
	jsonlFile: string;
	fileOffset: number;
	lineBuffer: string;
	activeToolIds: Set<string>;
	activeToolStatuses: Map<string, string>;
	activeToolNames: Map<string, string>;
	activeSubagentToolIds: Map<string, Set<string>>;
	activeSubagentToolNames: Map<string, Map<string, string>>;
	isWaiting: boolean;
	permissionSent: boolean;
	hadToolsInTurn: boolean;
	lastActivityTime: number;
}

export interface RoomSummary {
	projectHash: string;
	displayName: string;
	projectPath: string;
	activeAgentCount: number;
	agentSummaries: AgentSummary[];
	lastActivityTime: number;
}

export interface AgentSummary {
	id: string;
	isActive: boolean;
	isWaiting: boolean;
	currentTool: string | null;
}

export interface SeatMeta {
	palette: number;
	hueShift: number;
	seatId: string | null;
}

export interface AgentSnapshot {
	id: string;
	isWaiting: boolean;
	activeTools: Array<{ toolId: string; status: string }>;
	palette?: number;
	hueShift?: number;
	seatId?: string | null;
}
