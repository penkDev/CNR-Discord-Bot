import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { requireStaffRole } from '../utils/checks.js';

export const data = new SlashCommandBuilder()
  .setName('resetleaderboard')
  .setDescription("Reset all players' playtime to 0 (Staff only).");

export async function execute(interaction, { config, db }) {
  requireStaffRole(interaction, config);
  db.resetPlaytime();
  return interaction.reply({ content: '✅ All player playtimes have been reset to 0.', flags: MessageFlags.Ephemeral });
}
