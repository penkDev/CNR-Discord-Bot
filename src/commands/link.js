import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { requireCrewRole } from '../utils/checks.js';
import { Color, createEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('link')
  .setDescription('Link your Discord account to the specified game username.')
  .addStringOption((option) => option.setName('username').setDescription('The username to link with your Discord account.').setRequired(true));

export async function execute(interaction, { config, db }) {
  requireCrewRole(interaction, config);
  const username = interaction.options.getString('username', true);
  const reply = (payload) => interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });

  const player = db.getPlayerByUsername(username);
  if (!player) return reply({ content: `No UUID found for username '${username}'.` });

  const owner = db.getLinkOwner(player.uid);
  if (owner && owner !== interaction.user.id) {
    return reply({ content: 'That username is already linked to another Discord account.' });
  }

  db.upsertLink(interaction.user.id, player.uid);
  const embed = createEmbed(config, Color.playtime)
    .setTitle('✅ Successfully Linked')
    .setDescription(`Your account is now linked to **${username}**.`);
  return reply({ embeds: [embed] });
}
