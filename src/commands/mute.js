import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { requirePermission } from '../utils/checks.js';
import { Color, createEmbed } from '../utils/embeds.js';
import { assertModeratable, getTargetMember, sendStaffLog } from '../services/moderation.js';

const DURATIONS = [
  { name: '1 minute', minutes: 1 },
  { name: '5 minutes', minutes: 5 },
  { name: '10 minutes', minutes: 10 },
  { name: '30 minutes', minutes: 30 },
  { name: '1 hour', minutes: 60 },
  { name: '4 hours', minutes: 240 },
  { name: '10 hours', minutes: 600 },
  { name: '1 day', minutes: 1440 },
  { name: '1 week', minutes: 10080 },
];

export const data = new SlashCommandBuilder()
  .setName('mute')
  .setDescription('Mute a player.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((option) => option.setName('member').setDescription('The member to mute').setRequired(true))
  .addStringOption((option) => option.setName('reason').setDescription('Reason for muting').setRequired(true).setMaxLength(512))
  .addIntegerOption((option) => option
    .setName('duration')
    .setDescription('Duration of the mute')
    .setRequired(true)
    .addChoices(...DURATIONS.map(({ name, minutes }) => ({ name, value: minutes }))));

export async function execute(interaction, ctx) {
  requirePermission(interaction, PermissionFlagsBits.ModerateMembers);
  const member = getTargetMember(interaction);
  assertModeratable(interaction, member, member.moderatable);
  const reason = interaction.options.getString('reason', true);
  const minutes = interaction.options.getInteger('duration', true);
  const duration = DURATIONS.find((entry) => entry.minutes === minutes);
  if (!duration) return interaction.reply({ content: '❌ Invalid mute duration.', flags: MessageFlags.Ephemeral });

  await member.timeout(minutes * 60_000, reason);

  const embed = createEmbed(ctx.config, Color.blue)
    .setTitle('🔇 User Muted')
    .setDescription(
      `**Muted User:** ${member} (${member.user.tag})\n`
      + `**Reason:** ${reason}\n`
      + `**Muted By:** ${interaction.user} (${interaction.user.tag})\n`
      + `**Duration:** ${duration.name}`,
    )
    .setTimestamp(interaction.createdAt);
  await sendStaffLog(ctx, embed);
  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
