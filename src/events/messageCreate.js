import { Events, PermissionFlagsBits } from 'discord.js';
import { handleProfanity } from '../services/moderation.js';

export const name = Events.MessageCreate;

export async function execute(ctx, message) {
  const { profanity } = ctx.config.moderation;
  if (!profanity.enabled || !ctx.profanityRegex) return;
  if (message.channelId !== ctx.config.channels.monitored) return;
  if (message.author.bot || !message.inGuild() || !message.member) return;
  if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;
  if (message.member.roles.cache.has(ctx.config.staffRoleId)) return;

  await handleProfanity(ctx, message, ctx.profanityRegex);
}
