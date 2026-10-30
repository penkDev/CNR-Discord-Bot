import { Color, createEmbed, fetchTextChannel, upsertMessage } from '../utils/embeds.js';
import { convertSecondsToHms } from '../utils/time.js';

export function buildLeaderboardEmbed(config, rows) {
  const lines = rows.map((row, index) => `**${index + 1}. ${row.username}** - ${convertSecondsToHms(row.playtime)}`);
  return createEmbed(config, Color.leaderboard, 'footer')
    .setTitle('🏆 Top 10 Players by Playtime')
    .setTimestamp()
    .addFields({ name: 'Leaderboard', value: lines.length > 0 ? lines.join('\n') : 'No players to display.' });
}

export async function updateLeaderboard({ client, config, db }) {
  const channel = await fetchTextChannel(client, config.channels.leaderboard);
  if (!channel) return;
  const embed = buildLeaderboardEmbed(config, db.topPlayers(10));
  const stored = db.getLeaderboardMessageId();
  const live = await upsertMessage(channel, stored, { embeds: [embed] });
  if (live !== stored) db.setLeaderboardMessageId(live);
}
