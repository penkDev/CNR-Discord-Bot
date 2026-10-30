import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { requirePermission } from '../utils/checks.js';
import { assertModeratable, buildWarnEmbed, getTargetMember, issueWarning, sendStaffLog } from '../services/moderation.js';

export const data = new SlashCommandBuilder()
  .setName('warn')
  .setDescription('Warn a player.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((option) => option.setName('member').setDescription('The member to warn').setRequired(true))
  .addStringOption((option) => option.setName('reason').setDescription('Reason for the warning').setRequired(true).setMaxLength(512));

export async function execute(interaction, ctx) {
  requirePermission(interaction, PermissionFlagsBits.ModerateMembers);
  const member = getTargetMember(interaction);
  assertModeratable(interaction, member);
  const reason = interaction.options.getString('reason', true);

  const result = await issueWarning(ctx, { member, moderatorId: interaction.user.id, reason });
  const embed = buildWarnEmbed(ctx.config, { member, moderatorId: interaction.user.id, reason, result }).setTimestamp(interaction.createdAt);
  await sendStaffLog(ctx, embed);
  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
