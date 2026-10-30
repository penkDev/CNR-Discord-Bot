import { Routes } from 'discord.js';

export async function registerCommands({ client, config, commands }) {
  const body = [...commands.values()].map((command) => command.data.toJSON());
  await client.rest.put(Routes.applicationGuildCommands(client.application.id, config.guildId), { body });
  console.log(`Registered ${body.length} slash commands`);
}
