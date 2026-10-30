import { readdir } from 'node:fs/promises';
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { ConfigError, loadConfig } from './config.js';
import { openDatabase } from './db.js';
import { buildProfanityRegex } from './services/moderation.js';

async function loadModules(directory) {
  const folder = new URL(`./${directory}/`, import.meta.url);
  const files = (await readdir(folder)).filter((file) => file.endsWith('.js'));
  return Promise.all(files.map((file) => import(new URL(file, folder).href)));
}

let config;
try {
  config = loadConfig();
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  console.error(error.message);
  process.exit(1);
}
config.warnings.forEach((warning) => console.warn(`Config: ${warning}`));

const db = openDatabase(config.databasePath);
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel],
});

const commands = new Map();
for (const command of await loadModules('commands')) commands.set(command.data.name, command);

const ctx = {
  client,
  config,
  db,
  commands,
  loops: [],
  profanityRegex: config.moderation.profanity.enabled ? buildProfanityRegex(config.moderation.profanity.words) : null,
};

for (const event of await loadModules('events')) {
  const handler = (...args) => event.execute(ctx, ...args).catch((error) => console.error(`Error in ${event.name}:`, error));
  if (event.once) client.once(event.name, handler);
  else client.on(event.name, handler);
}

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await Promise.all(ctx.loops.map((loop) => loop.stop()));
    db.markAllOffline();
    await client.destroy();
    db.close();
  } catch (error) {
    console.error('Error during shutdown:', error);
  }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('unhandledRejection', (reason) => console.error('Unhandled rejection:', reason));

await client.login(config.botToken);
