import { Agent, fetch } from 'undici';

const REQUEST_TIMEOUT_MS = 10_000;
// Game servers and the status endpoint use self signed certificates.
const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });

async function getJson(url, label, { insecure = false } = {}) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ...(insecure && { dispatcher: insecureAgent }),
    });
    if (!response.ok) {
      console.warn(`${label} returned status ${response.status}`);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.warn(`${label} request failed: ${error.cause?.code ?? error.name}`);
    return null;
  }
}

/** The API returns Username as a plain string, older responses nested it as { Username }. */
export function parsePlayers(data) {
  if (!Array.isArray(data)) return null;
  const players = [];
  for (const entry of data) {
    const uid = entry?.Uid;
    const username = typeof entry?.Username === 'string' ? entry.Username : entry?.Username?.Username;
    if (uid && username) players.push({ uid: String(uid), username });
  }
  return players;
}

/** Returns [{ uid, username }] or null when the server could not be queried. */
export async function fetchPlayers(server, url) {
  return parsePlayers(await getJson(url, `Server ${server.toUpperCase()}`));
}

/** Returns a Map of lowercase server id to its status entry, empty on failure. */
export async function fetchServerStatus(url) {
  const data = await getJson(url, 'Server status endpoint', { insecure: true });
  const statuses = new Map();
  if (Array.isArray(data)) {
    for (const entry of data) {
      if (typeof entry?.Id === 'string') statuses.set(entry.Id.toLowerCase(), entry);
    }
  }
  return statuses;
}

/** Returns the in game time string (e.g. "Monday 14:30") or null. */
export async function fetchGameTime(server, url) {
  const data = await getJson(url, `Server ${server.toUpperCase()} status`, { insecure: true });
  return data?.vars?.Time ?? null;
}
