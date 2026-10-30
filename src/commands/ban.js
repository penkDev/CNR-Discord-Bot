import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { requirePermission } from '../utils/checks.js';
import { Color, createEmbed } from '../utils/embeds.js';
import { assertModeratable, getTargetMember, sendStaffLog } from '../services/moderation.js';

export const data = new SlashCommandBuilder()
  .setName('ban')
  .setDescription('Ban a player.')
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addUserOption((option) => option.setName('member').setDescription('The member to ban').setRequired(true))
  .addStringOption((option) => option.setName('reason').setDescription('Reason for banning').setRequired(true).setMaxLength(512));

export async function execute(interaction, ctx) {
  requirePermission(interaction, PermissionFlagsBits.BanMembers);
  const member = getTargetMember(interaction);
  assertModeratable(interaction, member, member.bannable);
  const reason = interaction.options.getString('reason', true);

  await member.ban({ reason });

  const embed = createEmbed(ctx.config, Color.red)
    .setTitle('🚫 User Banned')
    .setDescription(
      `**Banned User:** ${member} (${member.user.tag})\n`
      + `**Reason:** ${reason}\n`
      + `**Banned By:** ${interaction.user} (${interaction.user.tag})`,
    )
    .setTimestamp(interaction.createdAt);
  await sendStaffLog(ctx, embed);
  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
