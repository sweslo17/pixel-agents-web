import * as path from 'path';
import { fileURLToPath } from 'url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebSocket from '@fastify/websocket';
import { DEFAULT_PORT } from '@pixel-agents/shared';
import { SessionScanner } from './core/sessionScanner.js';
import { WsBroadcaster } from './ws/wsBroadcaster.js';
import { handleWsConnection } from './ws/wsRouter.js';
import { registerAssetRoutes } from './routes/assets.js';
import { registerHealthRoutes } from './routes/health.js';
import { getRoomSummary } from './core/projectManager.js';

const app = Fastify({ logger: true });
const broadcaster = new WsBroadcaster();

// Assets are in server/assets/ relative to this file's compiled location
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.join(__dirname, '..', 'assets');

const scanner = new SessionScanner({
	onRoomAppeared: (project) => {
		project.messageSink = broadcaster.createRoomSink(project.projectHash);
		broadcaster.broadcastLobby({
			type: 'roomAppeared',
			room: getRoomSummary(project),
		});
	},
	onRoomDisappeared: (hash) => {
		broadcaster.broadcastLobby({ type: 'roomDisappeared', projectHash: hash });
	},
	onAgentAppeared: (hash, sessionId) => {
		broadcaster.broadcastRoom(hash, { type: 'agentCreated', id: sessionId });
		// Also update lobby
		const project = scanner.getProject(hash);
		if (project) {
			broadcaster.broadcastLobby({
				type: 'lobbyAgentUpdate',
				projectHash: hash,
				summary: getRoomSummary(project),
			});
		}
	},
	onAgentDisappeared: (hash, sessionId) => {
		broadcaster.broadcastRoom(hash, { type: 'agentClosed', id: sessionId });
		const project = scanner.getProject(hash);
		if (project) {
			broadcaster.broadcastLobby({
				type: 'lobbyAgentUpdate',
				projectHash: hash,
				summary: getRoomSummary(project),
			});
		}
	},
	onNewRoomReady: (project) => {
		// Fires after display names are computed — notify ALL clients
		broadcaster.broadcastAll({
			type: 'newRoomNotification',
			projectHash: project.projectHash,
			displayName: project.displayName,
		});
	},
});

await app.register(fastifyWebSocket);

// Serve client SPA static files in production
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
await app.register(fastifyStatic, {
	root: clientDist,
	prefix: '/',
});

await registerAssetRoutes(app, assetsDir);
await registerHealthRoutes(app);

// WebSocket endpoint
app.get('/ws', { websocket: true }, (socket) => {
	handleWsConnection(socket, broadcaster, scanner);
});

// SPA fallback
app.setNotFoundHandler((_req, reply) => {
	if (!_req.url.startsWith('/api/') && !_req.url.startsWith('/ws')) {
		return reply.sendFile('index.html');
	}
	return reply.code(404).send({ error: 'Not found' });
});

scanner.start();
await app.listen({ port: DEFAULT_PORT, host: '127.0.0.1' });
console.log(`Pixel Agents running at http://localhost:${DEFAULT_PORT}`);
