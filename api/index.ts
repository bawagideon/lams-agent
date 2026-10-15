import type { IncomingMessage, ServerResponse } from 'node:http';
import { MissionControlServer } from '../src/server/MissionControlServer.ts';

const missionControl = new MissionControlServer();

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  return missionControl.handleRequest(req, res);
}
