import { SlashCommandBuilder } from 'discord.js';
import { Color, createEmbed } from '../utils/embeds.js';
import { convertSecondsToHms } from '../utils/time.js';

export const data = new SlashCommandBuilder()
  .setName('playtime')
  .setDescription('Displays the total playtime of a user.')
  .addUserOption((option) => option.setName('member').setDescription('The member to get playtime for.').setRequired(true));

export async function execute(interaction, { config, db }) {
  const user = interaction.options.getUser('member', true);
  const displayName = interaction.options.getMember('member')?.displayName ?? user.displayName;

  const link = db.getLinkByDiscordId(user.id);
  if (!link) {
    return interaction.reply(`${displayName} has not linked their UUID. Use \`/link\` to link.`);
  }

  if (link.playtime === null) {
    const embed = createEmbed(config, Color.warning)
      .setTitle('❓ No recorded playtime')
      .setDescription(`${displayName} has no recorded playtime.`)
      .setTimestamp();
    return interaction.reply({ embeds: [embed] });
  }

  const embed = createEmbed(config, Color.playtime)
    .setTitle(`📊 ${displayName}'s Playtime`)
    .setAuthor({ name: interaction.user.displayName, iconURL: interaction.user.displayAvatarURL() })
    .addFields({ name: 'Total Playtime', value: convertSecondsToHms(link.playtime), inline: false })
    .setTimestamp();
  return interaction.reply({ embeds: [embed] });
}
