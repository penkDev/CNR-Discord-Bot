import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const DEFAULT_CONFIG_PATH = resolve(ROOT, 'config.yml');

const DEFAULT_IMAGE = 'https://i.pinimg.com/originals/9a/3c/3f/9a3c3fb5f73822af8514df07f6676392.gif';
const MAX_TIMEOUT_MINUTES = 40320;

export class ConfigError extends Error {
  constructor(problems) {
    super(`Invalid config:\n- ${problems.join('\n- ')}`);
    this.problems = problems;
  }
}

const isPlaceholder = (value) => /_here$/i.test(value) || /^url$/i.test(value) || value === '';

// YAML is parsed with intAsBigInt so unquoted 19 digit snowflakes keep their precision.
function readString(value) {
  if (typeof value === 'bigint' || typeof value === 'number') return String(value);
  return typeof value === 'string' ? value.trim() : null;
}

function readId(value) {
  const text = readString(value);
  return text !== null && /^\d+$/.test(text) ? text : null;
}

function readUrl(value) {
  const text = readString(value);
  return text !== null && /^https?:\/\//i.test(text) ? text : null;
}

function readInt(value) {
  return typeof value === 'bigint' ? Number(value) : value;
}

export function parseConfig(text) {
  const raw = parse(text, { intAsBigInt: true });
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ConfigError(['config file is empty or not a YAML mapping']);
  }

  const problems = [];
  const warnings = [];

  const requiredText = (key) => {
    const value = readString(raw[key]);
    if (value === null || isPlaceholder(value)) problems.push(`${key} is missing or still a placeholder`);
    return value;
  };
  const requiredId = (key) => {
    const value = readId(raw[key]);
    if (value === null) problems.push(`${key} is missing, still a placeholder or not a numeric ID`);
    return value;
  };
  const optionalId = (key, label = key) => {
    const value = readId(raw[key]);
    if (value === null) warnings.push(`${label} is not set, the matching feature is skipped`);
    return value;
  };

  const botToken = requiredText('bottoken');
  const guildId = requiredId('guild_id');
  const staffRoleId = requiredId('staff_role_id');
  const crewRoleId = requiredId('crewmember_role_id');
  const serverStatusEndpoint = requiredText('server_status_endpoint');

  const endpointEntries = raw.endpoints && typeof raw.endpoints === 'object' ? Object.entries(raw.endpoints) : [];
  if (endpointEntries.length === 0) problems.push('endpoints is missing or empty');
  const endpoints = new Map(endpointEntries.map(([server, url]) => [server, String(url)]));

  const statusEntries = raw.status_endpoints && typeof raw.status_endpoints === 'object'
    ? Object.entries(raw.status_endpoints)
    : [];
  const statusEndpoints = new Map(statusEntries.map(([name, url]) => [name, String(url)]));

  const channels = {
    onlineUsers: optionalId('online_users_channel_id'),
    leaderboard: optionalId('leaderboard_channel_id'),
    staffLogs: optionalId('staff_logs_channel_id'),
    monitored: optionalId('monitored_channel_id'),
  };

  const images = raw.embed_images ?? {};
  const imageOrDefault = (key) => readUrl(images[key]) ?? DEFAULT_IMAGE;

  const verificationRaw = raw.verification ?? {};
  const verification = {
    enabled: verificationRaw.enabled === true,
    channelId: readId(verificationRaw.verification_channel_id),
    roleId: readId(verificationRaw.verified_role_id),
    logoUrl: readUrl(verificationRaw.logo_url),
  };
  if (verification.enabled && (verification.channelId === null || verification.roleId === null)) {
    warnings.push('verification.verification_channel_id or verification.verified_role_id is not set, verification is disabled');
    verification.enabled = false;
  }

  const moderationRaw = raw.moderation ?? {};
  const profanityRaw = moderationRaw.profanity ?? {};
  const threshold = readInt(moderationRaw.warn_timeout_threshold ?? 3);
  const timeoutMinutes = readInt(moderationRaw.warn_timeout_minutes ?? 60);
  if (!Number.isInteger(threshold) || threshold < 1) {
    problems.push('moderation.warn_timeout_threshold must be an integer >= 1');
  }
  if (!Number.isInteger(timeoutMinutes) || timeoutMinutes < 1 || timeoutMinutes > MAX_TIMEOUT_MINUTES) {
    problems.push(`moderation.warn_timeout_minutes must be an integer between 1 and ${MAX_TIMEOUT_MINUTES}`);
  }
  const words = profanityRaw.words ?? [];
  if (!Array.isArray(words) || !words.every((word) => typeof word === 'string')) {
    problems.push('moderation.profanity.words must be a list of strings');
  }

  if (problems.length > 0) throw new ConfigError(problems);

  return {
    botToken,
    guildId,
    staffRoleId,
    crewRoleId,
    databasePath: resolve(ROOT, readString(raw.database?.name) ?? 'players.db'),
    endpoints,
    serverStatusEndpoint,
    statusEndpoints,
    channels,
    images: { footer: imageOrDefault('footer_thumbnail'), logs: imageOrDefault('logs_thumbnail') },
    verification,
    moderation: {
      warnTimeoutThreshold: threshold,
      warnTimeoutMinutes: timeoutMinutes,
      profanity: { enabled: profanityRaw.enabled === true, words },
    },
    warnings,
  };
}

export function loadConfig(path = DEFAULT_CONFIG_PATH) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new ConfigError([`config file not found at ${path}, copy config.example.yml to config.yml`]);
    }
    throw error;
  }
  return parseConfig(text);
}
