import { MissionControlServer } from './server/MissionControlServer.ts';
import { config } from './config/env.ts';

console.log('====================================================');
console.log('             LAMS HQ: AI CREATOR OPERATIONS         ');
console.log('====================================================');

const port = config.PORT || 4200;
const server = new MissionControlServer(port);

server.start().then(() => {
  console.log(`\nReady for operations: Open http://localhost:${port} in your browser.`);
});
