import { Events } from 'discord.js';
import { filterMessage } from '../services/moderation.js';

export const name = Events.MessageCreate;

export async function execute(ctx, message) {
  await filterMessage(ctx, message);
}
