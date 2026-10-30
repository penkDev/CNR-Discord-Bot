import { MessageFlags, PermissionFlagsBits, RESTJSONErrorCodes, SlashCommandBuilder } from 'discord.js';
import { requirePermission } from '../utils/checks.js';
import { Color, createEmbed, isDiscordError } from '../utils/embeds.js';
import { sendStaffLog } from '../services/moderation.js';

const CHUNK_SIZE = 20;

export const data = new SlashCommandBuilder()
  .setName('removelinks')
  .setDescription('Remove linked users without the crewmember role or not in server.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);

export async function execute(interaction, ctx) {
  requirePermission(interaction, PermissionFlagsBits.ManageRoles);
  const { config, db } = ctx;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const linkedUsers = db.allLinks();
  if (linkedUsers.length === 0) return interaction.editReply('No linked users found in the database.');

  const toUnlink = [];
  for (const { discord_id: discordId, username } of linkedUsers) {
    try {
      const member = await interaction.guild.members.fetch(discordId);
      if (!member.roles.cache.has(config.crewRoleId)) toUnlink.push({ discordId, username, reason: 'Missing role' });
    } catch (error) {
      if (isDiscordError(error, RESTJSONErrorCodes.UnknownMember)) {
        toUnlink.push({ discordId, username, reason: 'Not in server' });
      } else {
        console.error(`Error checking user ${discordId}:`, error);
      }
    }
  }

  if (toUnlink.length === 0) {
    return interaction.editReply('✅ All linked users have the crewmember role and are in the server.');
  }

  db.deleteLinks(toUnlink.map((entry) => entry.discordId));
  await interaction.editReply(
    `Successfully unlinked ${toUnlink.length} users who were either missing the crewmember role or not in the server.`,
  );

  const chunkCount = Math.ceil(toUnlink.length / CHUNK_SIZE);
  for (let index = 0; index < chunkCount; index++) {
    const lines = toUnlink
      .slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE)
      .map((entry) => `• Discord ID: ${entry.discordId} - Game name: **${entry.username}** - Reason: **${entry.reason}**`);
    const embed = createEmbed(config, Color.gold)
      .setTitle(`🔓 Unlinked Users (${index + 1}/${chunkCount})`)
      .setDescription(`The following users have been unlinked from the database:\n\n${lines.join('\n')}`);
    await interaction.channel.send({ embeds: [embed] });
  }

  await sendStaffLog(
    ctx,
    createEmbed(config, Color.gold)
      .setTitle('🔓 Bulk Unlink Action')
      .setDescription(`**${interaction.user}** ran the removelinks command and unlinked ${toUnlink.length} accounts.`)
      .setTimestamp(interaction.createdAt),
  );
}
