import { Events } from 'discord.js';
import { Color, createEmbed } from '../utils/embeds.js';
import { filterDeletedIds, sendStaffLog, truncate } from '../services/moderation.js';

export const name = Events.MessageDelete;

export async function execute(ctx, message) {
  if (message.channelId !== ctx.config.channels.monitored) return;
  if (filterDeletedIds.delete(message.id)) return;
  if (message.author?.bot) return;

  const author = message.author ? `${message.author} (${message.author.tag})` : 'unknown';
  const content = message.content === null ? 'content not cached' : truncate(message.content) || 'no text';
  await sendStaffLog(
    ctx,
    createEmbed(ctx.config, Color.red)
      .setTitle('🗑️ Message Deleted')
      .setTimestamp()
      .setDescription(`**Author:** ${author}\n**Channel:** <#${message.channelId}>\n**Content:** ${content}`),
  );
}
