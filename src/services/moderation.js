import { Color, createEmbed, fetchTextChannel } from '../utils/embeds.js';
import { UserError } from '../utils/checks.js';

const MS_PER_MINUTE = 60_000;
const MAX_LOGGED_CONTENT = 1000;

// Message ids deleted by the profanity filter, so the delete event does not log them a second time.
export const filterDeletedIds = new Set();

export async function sendStaffLog({ client, config }, embed) {
  const channel = await fetchTextChannel(client, config.channels.staffLogs);
  if (!channel) return;
  try {
    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Failed to write to the staff log:', error);
  }
}

export function truncate(text, limit = MAX_LOGGED_CONTENT) {
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

/**
 * Returns the reason a moderation action must not run, or null.
 * `botCanAct` is the result of Discord's kickable, bannable or moderatable check.
 */
export function getModerationBlocker({ ownerId, botId, actor, target, botCanAct = true }) {
  if (target.id === ownerId) return 'You cannot moderate the server owner.';
  if (target.id === botId) return 'You cannot moderate the bot.';
  if (target.id === actor.id) return 'You cannot moderate yourself.';
  if (actor.id !== ownerId && target.roles.highest.position >= actor.roles.highest.position) {
    return 'You cannot moderate a member whose highest role is equal to or above yours.';
  }
  if (!botCanAct) return 'I cannot moderate this member, my highest role is not above theirs.';
  return null;
}

export function getTargetMember(interaction) {
  const member = interaction.options.getMember('member');
  if (!member) throw new UserError('That user is not a member of this server.');
  return member;
}

export function assertModeratable(interaction, target, botCanAct) {
  const blocker = getModerationBlocker({
    ownerId: interaction.guild.ownerId,
    botId: interaction.client.user.id,
    actor: interaction.member,
    target,
    botCanAct,
  });
  if (blocker) throw new UserError(blocker);
}

/**
 * Stores a warning and applies the automatic timeout once the threshold is reached.
 * A failing timeout never removes the stored warning.
 */
export async function issueWarning({ db, config }, { member, moderatorId, reason, now = new Date() }) {
  const { warnTimeoutThreshold, warnTimeoutMinutes } = config.moderation;
  db.addWarning(member.id, moderatorId, reason, now.toISOString());
  const count = db.countWarnings(member.id);

  const result = { count, timeoutApplied: false, timeoutError: null };
  if (count >= warnTimeoutThreshold) {
    try {
      await member.timeout(warnTimeoutMinutes * MS_PER_MINUTE, `Reached ${count} warnings`);
      result.timeoutApplied = true;
    } catch (error) {
      result.timeoutError = error.message;
    }
  }
  return result;
}

export function describeWarning(result, config) {
  if (result.timeoutApplied) return `Timeout applied for ${config.moderation.warnTimeoutMinutes} minutes.`;
  if (result.timeoutError) return `Timeout failed: ${result.timeoutError}`;
  return 'No timeout applied.';
}

export function buildWarnEmbed(config, { member, moderatorId, reason, result }) {
  return createEmbed(config, Color.gold)
    .setTitle('⚠️ User Warned')
    .setTimestamp()
    .setDescription(
      `**Warned User:** ${member} (${member.user.tag})\n`
      + `**Reason:** ${reason}\n`
      + `**Warned By:** <@${moderatorId}>\n`
      + `**Warnings:** ${result.count}\n`
      + describeWarning(result, config),
    );
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Returns a regex matching any word as a whole word, or null for an empty list. */
export function buildProfanityRegex(words) {
  const alternatives = words.map((word) => word.trim()).filter(Boolean).map(escapeRegExp);
  if (alternatives.length === 0) return null;
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}_])`, 'iu');
}

export async function handleProfanity(ctx, message, regex) {
  const word = regex.exec(message.content)?.[0];
  if (!word) return;

  filterDeletedIds.add(message.id);
  try {
    await message.delete();
  } catch (error) {
    filterDeletedIds.delete(message.id);
    console.error('Profanity filter could not delete a message:', error);
    return;
  }

  const member = message.member;
  const result = await issueWarning(ctx, {
    member,
    moderatorId: ctx.client.user.id,
    reason: 'Auto: profanity filter',
  });
  const embed = createEmbed(ctx.config, Color.orange)
    .setTitle('🧹 Profanity Filter')
    .setTimestamp()
    .setDescription(
      `**User:** ${member} (${member.user.tag})\n`
      + `**Channel:** <#${message.channelId}>\n`
      + `**Matched word:** ${word}\n`
      + `**Warnings:** ${result.count}\n`
      + describeWarning(result, ctx.config),
    );
  await sendStaffLog(ctx, embed);
}
