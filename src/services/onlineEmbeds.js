import { Color, createEmbed, fetchTextChannel, upsertMessage } from '../utils/embeds.js';
import { restartCountdown } from '../utils/time.js';
import { fetchGameTime, fetchServerStatus } from './cnrApi.js';

const FIELD_LIMIT = 1024;
const STATUS_IDS = new Map([['eu1', 'EU1'], ['eu2', 'EU2'], ['us1', 'US1'], ['us2', 'US2'], ['sea1', 'SEA']]);

/** Joins names with newlines and cuts the list to the embed field limit, ending with "+N more". */
export function formatPlayerList(names, limit = FIELD_LIMIT) {
  if (names.length === 0) return 'No online players.';
  const full = names.join('\n');
  if (full.length <= limit) return full;

  let best = 0;
  let length = 0;
  for (let count = 1; count <= names.length; count++) {
    length += names[count - 1].length + (count > 1 ? 1 : 0);
    if (length + `\n+${names.length - count} more`.length > limit) break;
    best = count;
  }
  const suffix = `+${names.length - best} more`;
  return best === 0 ? suffix : `${names.slice(0, best).join('\n')}\n${suffix}`;
}

export function buildOnlineEmbed(config, { server, status, restartTime, usernames }) {
  const value = (raw) => `\`${raw ?? 'N/A'}\``;
  return createEmbed(config, Color.info, 'footer')
    .setTitle(`🌐 Online Players - ${server.toUpperCase()}`)
    .setTimestamp()
    .addFields(
      { name: 'Players Online', value: value(status?.Players), inline: true },
      { name: 'Queue Length', value: value(status?.QueuedPlayers), inline: true },
      { name: 'Time till restart', value: value(restartTime), inline: true },
      { name: 'Online Users', value: formatPlayerList(usernames), inline: false },
    );
}

export async function updateOnlineEmbeds({ client, config, db }) {
  const channel = await fetchTextChannel(client, config.channels.onlineUsers);
  if (!channel) return;

  const statuses = await fetchServerStatus(config.serverStatusEndpoint);
  const servers = [...config.endpoints.keys()];
  const gameTimes = await Promise.all(servers.map((server) => {
    const url = config.statusEndpoints.get(`server_name ${server.toUpperCase()}`);
    return url ? fetchGameTime(server, url) : null;
  }));

  for (const [index, server] of servers.entries()) {
    const statusId = (STATUS_IDS.get(server) ?? server).toLowerCase();
    const embed = buildOnlineEmbed(config, {
      server,
      status: statuses.get(statusId),
      restartTime: gameTimes[index] ? restartCountdown(gameTimes[index]) : null,
      usernames: db.linkedOnlineUsernames(server),
    });
    try {
      const stored = db.getOnlineMessageId(server);
      const live = await upsertMessage(channel, stored, { embeds: [embed] });
      if (live !== stored) db.setOnlineMessageId(server, live);
    } catch (error) {
      console.error(`Failed to update online embed for ${server}:`, error);
    }
  }
}
