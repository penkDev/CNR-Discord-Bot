import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS players (
    uid TEXT PRIMARY KEY,
    username TEXT,
    playtime INTEGER DEFAULT 0,
    last_seen TEXT,
    server TEXT,
    is_online INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS discord_users (
    discord_id TEXT PRIMARY KEY,
    uuid TEXT UNIQUE
  );
  CREATE TABLE IF NOT EXISTS bot_metadata (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  CREATE TABLE IF NOT EXISTS online_users_embed (
    server TEXT PRIMARY KEY,
    message_id INTEGER
  );
  CREATE TABLE IF NOT EXISTS leaderboard_embed (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    message_id INTEGER
  );
  CREATE TABLE IF NOT EXISTS verification_message (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    message_id INTEGER,
    channel_id INTEGER
  );
  CREATE TABLE IF NOT EXISTS warnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_warnings_discord_id ON warnings (discord_id);
`;

// Snowflakes exceed 2^53. Message and channel IDs are written as BigInt into the INTEGER
// columns and read back with setReadBigInts, converted to String at the boundary.
// Older databases created by the Python bot use the same INTEGER columns and stay readable.
const toSnowflake = (id) => BigInt(id);
const fromSnowflake = (value) => (value === undefined || value === null ? null : String(value));

export function openDatabase(path) {
  const raw = new DatabaseSync(path);
  raw.exec('PRAGMA journal_mode = WAL');
  raw.exec('PRAGMA foreign_keys = ON');
  raw.exec(SCHEMA);

  const statement = (sql, { bigInts = false } = {}) => {
    const prepared = raw.prepare(sql);
    if (bigInts) prepared.setReadBigInts(true);
    return prepared;
  };

  const sql = {
    getMeta: statement('SELECT value FROM bot_metadata WHERE key = ?'),
    setMeta: statement('INSERT INTO bot_metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
    getPlayerByUsername: statement('SELECT uid, username, playtime FROM players WHERE username = ?'),
    getPlayerByUid: statement('SELECT uid, username, playtime, last_seen, server, is_online FROM players WHERE uid = ?'),
    insertPlayer: statement('INSERT INTO players (uid, username, last_seen, server, is_online, playtime) VALUES (?, ?, ?, ?, 1, 0)'),
    updatePlayer: statement('UPDATE players SET username = ?, last_seen = ?, is_online = 1, server = ?, playtime = playtime + ? WHERE uid = ?'),
    onlineUidsOnServer: statement('SELECT uid FROM players WHERE is_online = 1 AND server = ?'),
    setOffline: statement('UPDATE players SET is_online = 0 WHERE uid = ?'),
    setAllOffline: statement('UPDATE players SET is_online = 0 WHERE is_online = 1'),
    resetPlaytime: statement('UPDATE players SET playtime = 0'),
    linkedOnlineUsernames: statement('SELECT p.username FROM players p JOIN discord_users d ON p.uid = d.uuid WHERE p.server = ? AND p.is_online = 1'),
    topPlayers: statement('SELECT p.username, p.playtime FROM players p JOIN discord_users d ON p.uid = d.uuid ORDER BY p.playtime DESC LIMIT ?'),
    linkedPlayers: statement('SELECT p.username, p.playtime, d.discord_id FROM players p JOIN discord_users d ON p.uid = d.uuid ORDER BY p.playtime DESC'),
    allLinks: statement('SELECT d.discord_id, d.uuid, p.username FROM discord_users d JOIN players p ON d.uuid = p.uid'),
    linkOwner: statement('SELECT discord_id FROM discord_users WHERE uuid = ?'),
    linkByDiscordId: statement('SELECT d.uuid, p.username, p.playtime FROM discord_users d LEFT JOIN players p ON d.uuid = p.uid WHERE d.discord_id = ?'),
    upsertLink: statement('INSERT INTO discord_users (discord_id, uuid) VALUES (?, ?) ON CONFLICT(discord_id) DO UPDATE SET uuid = excluded.uuid'),
    deleteLink: statement('DELETE FROM discord_users WHERE discord_id = ?'),
    getOnlineMessage: statement('SELECT message_id FROM online_users_embed WHERE server = ?', { bigInts: true }),
    setOnlineMessage: statement('INSERT INTO online_users_embed (server, message_id) VALUES (?, ?) ON CONFLICT(server) DO UPDATE SET message_id = excluded.message_id'),
    getLeaderboardMessage: statement('SELECT message_id FROM leaderboard_embed WHERE id = 1', { bigInts: true }),
    setLeaderboardMessage: statement('INSERT INTO leaderboard_embed (id, message_id) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET message_id = excluded.message_id'),
    getVerificationMessage: statement('SELECT message_id, channel_id FROM verification_message WHERE id = 1', { bigInts: true }),
    setVerificationMessage: statement('INSERT INTO verification_message (id, message_id, channel_id) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET message_id = excluded.message_id, channel_id = excluded.channel_id'),
    addWarning: statement('INSERT INTO warnings (discord_id, moderator_id, reason, created_at) VALUES (?, ?, ?, ?)'),
    countWarnings: statement('SELECT COUNT(*) AS count FROM warnings WHERE discord_id = ?'),
    listWarnings: statement('SELECT id, moderator_id, reason, created_at FROM warnings WHERE discord_id = ? ORDER BY id DESC LIMIT ?'),
    clearWarnings: statement('DELETE FROM warnings WHERE discord_id = ?'),
  };

  function transaction(fn) {
    raw.exec('BEGIN');
    try {
      const result = fn();
      raw.exec('COMMIT');
      return result;
    } catch (error) {
      raw.exec('ROLLBACK');
      throw error;
    }
  }

  return {
    raw,
    close: () => raw.close(),
    transaction,

    getLastRun: () => sql.getMeta.get('last_run')?.value ?? null,
    setLastRun: (iso) => void sql.setMeta.run('last_run', iso),

    getPlayerByUid: (uid) => sql.getPlayerByUid.get(uid) ?? null,
    getPlayerByUsername: (username) => sql.getPlayerByUsername.get(username) ?? null,
    resetPlaytime: () => void sql.resetPlaytime.run(),
    markAllOffline: () => void sql.setAllOffline.run(),

    /**
     * Applies one poll in a single transaction. `results` holds one entry per successfully queried
     * server. Players of servers that failed are left untouched.
     */
    applyPoll({ results, delta, nowIso, lastRunIso }) {
      transaction(() => {
        const fetchedUids = new Set();
        for (const { server, players } of results) {
          for (const { uid, username } of players) {
            fetchedUids.add(uid);
            if (sql.getPlayerByUid.get(uid)) sql.updatePlayer.run(username, nowIso, server, delta, uid);
            else sql.insertPlayer.run(uid, username, nowIso, server);
          }
        }
        for (const { server } of results) {
          for (const { uid } of sql.onlineUidsOnServer.all(server)) {
            if (!fetchedUids.has(uid)) sql.setOffline.run(uid);
          }
        }
        sql.setMeta.run('last_run', lastRunIso);
      });
    },

    linkedOnlineUsernames: (server) => sql.linkedOnlineUsernames.all(server).map((row) => row.username),
    topPlayers: (limit) => sql.topPlayers.all(limit),
    linkedPlayers: () => sql.linkedPlayers.all(),
    allLinks: () => sql.allLinks.all(),
    getLinkOwner: (uuid) => sql.linkOwner.get(uuid)?.discord_id ?? null,
    getLinkByDiscordId: (discordId) => sql.linkByDiscordId.get(discordId) ?? null,
    upsertLink: (discordId, uuid) => void sql.upsertLink.run(discordId, uuid),
    deleteLink: (discordId) => Number(sql.deleteLink.run(discordId).changes),
    deleteLinks: (discordIds) => transaction(() => discordIds.reduce((total, id) => total + Number(sql.deleteLink.run(id).changes), 0)),

    getOnlineMessageId: (server) => fromSnowflake(sql.getOnlineMessage.get(server)?.message_id),
    setOnlineMessageId: (server, id) => void sql.setOnlineMessage.run(server, toSnowflake(id)),
    getLeaderboardMessageId: () => fromSnowflake(sql.getLeaderboardMessage.get()?.message_id),
    setLeaderboardMessageId: (id) => void sql.setLeaderboardMessage.run(toSnowflake(id)),
    getVerificationMessageId: () => fromSnowflake(sql.getVerificationMessage.get()?.message_id),
    setVerificationMessage: (messageId, channelId) => void sql.setVerificationMessage.run(toSnowflake(messageId), toSnowflake(channelId)),

    addWarning: (discordId, moderatorId, reason, createdAtIso) => void sql.addWarning.run(discordId, moderatorId, reason, createdAtIso),
    countWarnings: (discordId) => Number(sql.countWarnings.get(discordId).count),
    listWarnings: (discordId, limit) => sql.listWarnings.all(discordId, limit),
    clearWarnings: (discordId) => Number(sql.clearWarnings.run(discordId).changes),
  };
}
