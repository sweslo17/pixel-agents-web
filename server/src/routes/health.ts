import type { FastifyInstance } from 'fastify';

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
	app.get('/api/health', () => ({ status: 'ok', timestamp: Date.now() }));
}
