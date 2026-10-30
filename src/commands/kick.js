import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { requirePermission } from '../utils/checks.js';
import { Color, createEmbed } from '../utils/embeds.js';
import { assertModeratable, getTargetMember, sendStaffLog } from '../services/moderation.js';

export const data = new SlashCommandBuilder()
  .setName('kick')
  .setDescription('Kick a player.')
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
  .addUserOption((option) => option.setName('member').setDescription('The member to kick').setRequired(true))
  .addStringOption((option) => option.setName('reason').setDescription('Reason for kicking').setRequired(true).setMaxLength(512));

export async function execute(interaction, ctx) {
  requirePermission(interaction, PermissionFlagsBits.KickMembers);
  const member = getTargetMember(interaction);
  assertModeratable(interaction, member, member.kickable);
  const reason = interaction.options.getString('reason', true);

  await member.kick(reason);

  const embed = createEmbed(ctx.config, Color.orange)
    .setTitle('🚪 User Kicked')
    .setDescription(
      `**Kicked User:** ${member} (${member.user.tag})\n`
      + `**Reason:** ${reason}\n`
      + `**Kicked By:** ${interaction.user} (${interaction.user.tag})`,
    )
    .setTimestamp(interaction.createdAt);
  await sendStaffLog(ctx, embed);
  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
