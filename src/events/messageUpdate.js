import { Events } from 'discord.js';
import { Color, createEmbed } from '../utils/embeds.js';
import { filterMessage, sendStaffLog, truncate } from '../services/moderation.js';

export const name = Events.MessageUpdate;

export async function execute(ctx, oldMessage, newMessage) {
  if (newMessage.channelId !== ctx.config.channels.monitored) return;
  if (newMessage.author?.bot) return;
  if (newMessage.content === null || oldMessage.content === newMessage.content) return;
  if (await filterMessage(ctx, newMessage)) return;

  const author = newMessage.author ? `${newMessage.author} (${newMessage.author.tag})` : 'unknown';
  const before = oldMessage.content === null ? 'content not cached' : truncate(oldMessage.content) || 'no text';
  await sendStaffLog(
    ctx,
    createEmbed(ctx.config, Color.blue)
      .setTitle('✏️ Message Edited')
      .setTimestamp()
      .setDescription(
        `**Author:** ${author}\n**Channel:** <#${newMessage.channelId}>\n[Jump to message](${newMessage.url})`,
      )
      .addFields(
        { name: 'Before', value: before },
        { name: 'After', value: truncate(newMessage.content) || 'empty' },
      ),
  );
}
