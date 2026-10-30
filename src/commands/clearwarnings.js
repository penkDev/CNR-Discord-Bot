import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { requirePermission } from '../utils/checks.js';
import { Color, createEmbed } from '../utils/embeds.js';
import { sendStaffLog } from '../services/moderation.js';

export const data = new SlashCommandBuilder()
  .setName('clearwarnings')
  .setDescription('Delete all warnings of a member. Does not lift a running timeout.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((option) => option.setName('member').setDescription('The member to clear').setRequired(true));

export async function execute(interaction, ctx) {
  requirePermission(interaction, PermissionFlagsBits.ModerateMembers);
  const user = interaction.options.getUser('member', true);
  const removed = ctx.db.clearWarnings(user.id);

  const embed = createEmbed(ctx.config, Color.green)
    .setTitle('🧽 Warnings Cleared')
    .setDescription(
      `**User:** ${user} (${user.tag})\n`
      + `**Removed warnings:** ${removed}\n`
      + `**Cleared By:** ${interaction.user} (${interaction.user.tag})`,
    )
    .setTimestamp(interaction.createdAt);
  await sendStaffLog(ctx, embed);
  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
