import { Events, MessageFlags } from 'discord.js';
import { UserError } from '../utils/checks.js';
import {
  ENTER_PREFIX,
  MODAL_PREFIX,
  VERIFY_BUTTON_ID,
  handleEnterButton,
  handleModal,
  handleVerifyButton,
} from '../services/verification.js';

export const name = Events.InteractionCreate;

async function dispatch(ctx, interaction) {
  if (interaction.isChatInputCommand()) {
    await ctx.commands.get(interaction.commandName)?.execute(interaction, ctx);
  } else if (ctx.config.verification.enabled && interaction.isButton()) {
    if (interaction.customId === VERIFY_BUTTON_ID) await handleVerifyButton(interaction, ctx);
    else if (interaction.customId.startsWith(ENTER_PREFIX)) await handleEnterButton(interaction);
  } else if (ctx.config.verification.enabled && interaction.isModalSubmit()) {
    if (interaction.customId.startsWith(MODAL_PREFIX)) await handleModal(interaction, ctx);
  }
}

export async function execute(ctx, interaction) {
  try {
    await dispatch(ctx, interaction);
  } catch (error) {
    const content = error instanceof UserError ? error.message : '❌ An error occurred while processing the command.';
    if (!(error instanceof UserError)) console.error(`Error in interaction ${interaction.id}:`, error);
    const payload = { content, flags: MessageFlags.Ephemeral };
    try {
      if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
      else await interaction.reply(payload);
    } catch (replyError) {
      console.error('Could not send the error response:', replyError);
    }
  }
}
