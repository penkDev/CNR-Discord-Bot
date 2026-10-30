import { SlashCommandBuilder } from 'discord.js';
import { requireStaffRole } from '../utils/checks.js';
import { Color, FOOTER_TEXT, createEmbed } from '../utils/embeds.js';
import { convertSecondsToHms } from '../utils/time.js';

const PAGE_SIZE = 15;

export const data = new SlashCommandBuilder()
  .setName('listallmembers')
  .setDescription('Lists all linked members with their playtime.');

export async function execute(interaction, { config, db }) {
  requireStaffRole(interaction, config);
  const players = db.linkedPlayers();
  if (players.length === 0) return interaction.reply('No linked members found.');

  await interaction.reply(`Found ${players.length} linked members. Generating list...`);

  const pageCount = Math.ceil(players.length / PAGE_SIZE);
  for (let page = 0; page < pageCount; page++) {
    const start = page * PAGE_SIZE;
    const lines = players
      .slice(start, start + PAGE_SIZE)
      .map((player, index) => `**${start + index + 1}. ${player.username}** - ${convertSecondsToHms(player.playtime)} (<@${player.discord_id}>)`);
    const embed = createEmbed(config, Color.info)
      .setTitle(`💻 All Linked Members (Page ${page + 1}/${pageCount})`)
      .setDescription(lines.join('\n'))
      .setFooter({ text: `${FOOTER_TEXT} | Page ${page + 1}/${pageCount}`, iconURL: config.images.logs })
      .setTimestamp();
    await interaction.channel.send({ embeds: [embed] });
  }
}
