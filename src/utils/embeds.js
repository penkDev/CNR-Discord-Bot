import { DiscordAPIError, EmbedBuilder, RESTJSONErrorCodes } from 'discord.js';

export const Color = {
  green: 0x2ecc71,
  blue: 0x3498db,
  orange: 0xe67e22,
  red: 0xe74c3c,
  gold: 0xf1c40f,
  playtime: 0x00ff00,
  info: 0x00bfff,
  leaderboard: 0xffd700,
  warning: 0xffa500,
};

export const FOOTER_TEXT = 'CNR Crew Bot by penk';

/** `icon` selects which configured thumbnail the footer uses: 'logs' or 'footer'. */
export function createEmbed(config, color, icon = 'logs') {
  return new EmbedBuilder()
    .setColor(color)
    .setFooter({ text: FOOTER_TEXT, iconURL: config.images[icon] });
}

export async function fetchTextChannel(client, channelId) {
  if (!channelId) return null;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  return channel?.isTextBased() ? channel : null;
}

export const isDiscordError = (error, code) => error instanceof DiscordAPIError && error.code === code;

/** Edits the stored message, or sends a new one when it is gone. Returns the id of the live message. */
export async function upsertMessage(channel, storedId, payload) {
  if (storedId) {
    try {
      await channel.messages.edit(storedId, payload);
      return storedId;
    } catch (error) {
      if (!isDiscordError(error, RESTJSONErrorCodes.UnknownMessage)) throw error;
    }
  }
  const sent = await channel.send(payload);
  return sent.id;
}
