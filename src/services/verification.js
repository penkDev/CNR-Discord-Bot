import { randomInt, randomUUID } from 'node:crypto';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { GlobalFonts, createCanvas } from '@napi-rs/canvas';
import { Color, createEmbed, fetchTextChannel, upsertMessage } from '../utils/embeds.js';
import { sendStaffLog } from './moderation.js';

const CODE_LENGTH = 5;
const CODE_CHARS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'];
const CAPTCHA_TTL_MS = 5 * 60 * 1000;
const TEXT_COLORS = ['black', 'red', 'blue', 'green', 'rgb(64,107,76)', 'rgb(0,87,128)', 'rgb(0,3,82)'];
const LINE_COLORS = ['rgb(64,107,76)', 'rgb(0,87,128)', 'rgb(0,3,82)', 'rgb(191,0,255)', 'rgb(72,189,0)', 'rgb(189,107,0)', 'rgb(189,41,0)'];
const FONT_CANDIDATES = ['Arial', 'DejaVu Sans', 'Liberation Sans', 'Helvetica'];

export const VERIFY_BUTTON_ID = 'verify_button';
export const ENTER_PREFIX = 'verify_enter:';
export const MODAL_PREFIX = 'verify_modal:';

const pick = (list) => list[randomInt(list.length)];

export function generateCode() {
  return Array.from({ length: CODE_LENGTH }, () => pick(CODE_CHARS)).join('');
}

export async function renderCaptcha(code) {
  const canvas = createCanvas(90, 60);
  const context = canvas.getContext('2d');
  context.fillStyle = 'white';
  context.fillRect(0, 0, 90, 60);

  const family = FONT_CANDIDATES.find((name) => GlobalFonts.has(name)) ?? 'sans-serif';
  context.font = `18px ${family}`;
  context.textBaseline = 'top';
  context.fillStyle = pick(TEXT_COLORS);
  context.fillText(code, 20, 20);

  const point = () => [randomInt(5, 85), randomInt(5, 55)];
  for (let i = randomInt(6, 10) - 5; i > 0; i--) {
    context.strokeStyle = pick(LINE_COLORS);
    context.lineWidth = randomInt(1, 3);
    context.beginPath();
    context.moveTo(...point());
    context.lineTo(...point());
    context.stroke();
  }
  for (let i = randomInt(11, 20) - 10; i > 0; i--) {
    context.fillStyle = pick(TEXT_COLORS);
    context.fillRect(...point(), 1, 1);
  }
  return canvas.toBuffer('image/png');
}

export class CaptchaStore {
  #entries = new Map();
  #tokenByUser = new Map();

  constructor(ttlMs = CAPTCHA_TTL_MS, now = Date.now) {
    this.ttlMs = ttlMs;
    this.now = now;
  }

  /** Stores the code for the user and replaces any captcha they still had open. */
  create(userId, code) {
    this.#sweep();
    const previous = this.#tokenByUser.get(userId);
    if (previous) this.#entries.delete(previous);
    const token = randomUUID();
    this.#entries.set(token, { userId, code, expiresAt: this.now() + this.ttlMs });
    this.#tokenByUser.set(userId, token);
    return token;
  }

  /**
   * Returns 'ok', 'incorrect', 'expired' or 'invalid' (unknown token or token of another user).
   * Everything except 'invalid' consumes the captcha, so a code can only be guessed once.
   */
  redeem(token, userId, input) {
    const entry = this.#entries.get(token);
    if (!entry || entry.userId !== userId) return 'invalid';
    this.#remove(token, entry);
    if (entry.expiresAt <= this.now()) return 'expired';
    return input.trim() === entry.code ? 'ok' : 'incorrect';
  }

  #remove(token, entry) {
    this.#entries.delete(token);
    if (this.#tokenByUser.get(entry.userId) === token) this.#tokenByUser.delete(entry.userId);
  }

  #sweep() {
    for (const [token, entry] of this.#entries) {
      if (entry.expiresAt <= this.now()) this.#remove(token, entry);
    }
  }
}

const captchas = new CaptchaStore();

const withLogo = (embed, config) => (config.verification.logoUrl ? embed.setThumbnail(config.verification.logoUrl) : embed);
const ephemeral = (embed, extra = {}) => ({ embeds: [embed], flags: MessageFlags.Ephemeral, ...extra });

export async function ensureVerificationMessage(ctx) {
  const { client, config, db } = ctx;
  const channel = await fetchTextChannel(client, config.verification.channelId);
  if (!channel) {
    console.warn(`Verification channel ${config.verification.channelId} not found`);
    return;
  }

  const embed = withLogo(
    createEmbed(config, Color.blue)
      .setTitle('Verify Your Account')
      .setDescription('Click the button below to verify with our Discord server.')
      .addFields({
        name: 'Instructions',
        value: 'Solve the captcha shown after clicking the Verify button and enter the code.',
      })
      .setFooter({ text: 'Verification may take a moment.' }),
    config,
  );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(VERIFY_BUTTON_ID).setLabel('Verify').setStyle(ButtonStyle.Success),
  );

  const stored = db.getVerificationMessageId();
  const live = await upsertMessage(channel, stored, { embeds: [embed], components: [row] });
  if (live !== stored) db.setVerificationMessage(live, channel.id);
}

export async function handleVerifyButton(interaction, { config }) {
  if (interaction.member.roles.cache.has(config.verification.roleId)) {
    const embed = withLogo(
      createEmbed(config, Color.blue).setTitle('Already Verified').setDescription('You are already verified.'),
      config,
    );
    return interaction.reply(ephemeral(embed));
  }

  const code = generateCode();
  const token = captchas.create(interaction.user.id, code);
  const embed = withLogo(
    createEmbed(config, Color.blue)
      .setTitle('Captcha Verification')
      .setDescription('Click "Enter code" and type the characters shown in the image. The captcha is case-sensitive.')
      .setImage('attachment://captcha.png')
      .setFooter({ text: 'You have 5 minutes to complete this verification.' }),
    config,
  );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${ENTER_PREFIX}${token}`).setLabel('Enter code').setStyle(ButtonStyle.Primary),
  );
  const file = new AttachmentBuilder(await renderCaptcha(code), { name: 'captcha.png' });
  return interaction.reply(ephemeral(embed, { components: [row], files: [file] }));
}

export function handleEnterButton(interaction) {
  const token = interaction.customId.slice(ENTER_PREFIX.length);
  const input = new TextInputBuilder()
    .setCustomId('code')
    .setLabel('Characters from the image')
    .setStyle(TextInputStyle.Short)
    .setMinLength(CODE_LENGTH)
    .setMaxLength(CODE_LENGTH)
    .setRequired(true);
  const modal = new ModalBuilder()
    .setCustomId(`${MODAL_PREFIX}${token}`)
    .setTitle('Captcha Verification')
    .addComponents(new ActionRowBuilder().addComponents(input));
  return interaction.showModal(modal);
}

export async function handleModal(interaction, ctx) {
  const { config } = ctx;
  const token = interaction.customId.slice(MODAL_PREFIX.length);
  const outcome = captchas.redeem(token, interaction.user.id, interaction.fields.getTextInputValue('code'));
  const failure = (title, description) => interaction.reply(
    ephemeral(withLogo(createEmbed(config, Color.red).setTitle(title).setDescription(description), config)),
  );

  if (outcome === 'invalid') return failure('Timeout', 'This captcha is no longer valid. Click Verify to get a new one.');
  if (outcome === 'expired') return failure('Timeout', 'Verification failed due to timeout. Click Verify to try again.');
  if (outcome === 'incorrect') return failure('Incorrect Captcha', 'Verification failed. Click Verify to get a new captcha.');

  const role = interaction.guild.roles.cache.get(config.verification.roleId);
  if (!role) return failure('Role Not Found', 'Role Not Found. Please contact an admin to set up the verified role.');

  await interaction.member.roles.add(role);
  await interaction.reply(
    ephemeral(withLogo(
      createEmbed(config, Color.green).setTitle('Verification Successful').setDescription('You have been verified!'),
      config,
    )),
  );
  await sendStaffLog(
    ctx,
    createEmbed(config, Color.green)
      .setTitle('User Verified')
      .setTimestamp()
      .setDescription(`${interaction.user} (${interaction.user.username}) has been verified.`),
  );
}
