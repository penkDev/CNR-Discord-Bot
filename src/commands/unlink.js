import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { requirePermission } from '../utils/checks.js';
import { Color, createEmbed } from '../utils/embeds.js';
import { sendStaffLog } from '../services/moderation.js';

export const data = new SlashCommandBuilder()
  .setName('unlink')
  .setDescription('Unlink a Discord user from their game account.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addUserOption((option) => option.setName('member').setDescription('The member to unlink').setRequired(true));

export async function execute(interaction, ctx) {
  requirePermission(interaction, PermissionFlagsBits.ManageRoles);
  const { config, db } = ctx;
  const user = interaction.options.getUser('member', true);

  const link = db.getLinkByDiscordId(user.id);
  if (!link?.username) {
    return interaction.reply({ content: `❌ ${user} is not linked to any game account.`, flags: MessageFlags.Ephemeral });
  }
  db.deleteLink(user.id);

  const embed = createEmbed(config, Color.green)
    .setTitle('🔓 User Unlinked')
    .setDescription(`**${user}** has been unlinked from the database **${link.username}**.`)
    .setTimestamp(interaction.createdAt);
  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

  const logEmbed = createEmbed(config, Color.gold)
    .setTitle('🔓 User Unlinked')
    .setDescription(
      `**Unlinked User:** ${user} (${user.tag})\n`
      + `**Game Account:** ${link.username} (UUID: ${link.uuid})\n`
      + `**Unlinked By:** ${interaction.user} (${interaction.user.tag})`,
    )
    .setTimestamp(interaction.createdAt);
  await sendStaffLog(ctx, logEmbed);
}
