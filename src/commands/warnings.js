import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { requirePermission } from '../utils/checks.js';
import { Color, createEmbed } from '../utils/embeds.js';
import { truncate } from '../services/moderation.js';

const LIST_LIMIT = 10;
const REASON_PREVIEW = 150;

export const data = new SlashCommandBuilder()
  .setName('warnings')
  .setDescription('Show the warnings of a member.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((option) => option.setName('member').setDescription('The member to look up').setRequired(true));

export async function execute(interaction, { config, db }) {
  requirePermission(interaction, PermissionFlagsBits.ModerateMembers);
  const user = interaction.options.getUser('member', true);
  const total = db.countWarnings(user.id);

  const lines = db.listWarnings(user.id, LIST_LIMIT).map((warning) => {
    const unix = Math.floor(Date.parse(warning.created_at) / 1000);
    return `**#${warning.id}** <t:${unix}:d> by <@${warning.moderator_id}>: ${truncate(warning.reason, REASON_PREVIEW)}`;
  });
  const embed = createEmbed(config, Color.gold)
    .setTitle(`⚠️ Warnings for ${user.displayName} (${total})`)
    .setDescription(lines.length > 0 ? lines.join('\n') : 'No warnings.')
    .setTimestamp();
  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
