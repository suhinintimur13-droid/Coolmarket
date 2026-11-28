// Shared helper for talking to an Upstash Redis REST API (via Vercel's old
// "KV" product or the newer Upstash marketplace integration — both are the
// same Upstash Redis underneath, just with possibly different env var names
// depending on how/when it was connected). We auto-detect whichever names
// ended up in the environment instead of requiring one exact pair.

function findKvCreds() {
  // Known exact pairs, most common first.
  const exactPairs = [
    ['KV_REST_API_URL', 'KV_REST_API_TOKEN'],
    ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']
  ];
  for (const [u, t] of exactPairs) {
    if (process.env[u] && process.env[t]) {
      return { url: process.env[u], token: process.env[t] };
    }
  }
  // Generic fallback: Vercel/Upstash integrations sometimes prefix the
  // variable names with the database's own name, e.g. "MYDB_KV_REST_API_URL".
  // Find any *_URL env var that looks like a REST Redis endpoint and has a
  // matching *_TOKEN sibling.
  const keys = Object.keys(process.env);
  const urlKey = keys.find(
    (k) => /REST_API_URL$/.test(k) || /REDIS_REST_URL$/.test(k)
  );
  if (urlKey) {
    const tokenKey = urlKey.replace(/_URL$/, '_TOKEN');
    if (process.env[tokenKey]) {
      return { url: process.env[urlKey], token: process.env[tokenKey] };
    }
  }
  return null;
}

async function redis(cmd) {
  const creds = findKvCreds();
  if (!creds) {
    const err = new Error(
      'Storage not configured. Connect an Upstash (Redis) database to this project in Vercel -> Storage, then redeploy.'
    );
    err.code = 'KV_NOT_CONFIGURED';
    throw err;
  }
  const { url, token } = creds;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(cmd)
  });
  const j = await r.json();
  return j.result;
}

async function getJSON(key, fallback) {
  const raw = await redis(['GET', key]);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

async function setJSON(key, value) {
  await redis(['SET', key, JSON.stringify(value)]);
}

function isAdmin(req) {
  const ADMIN_KEY = process.env.ADMIN_KEY || '92hbwf9';
  const key = req.headers['x-admin-key'];
  return !!key && key === ADMIN_KEY;
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body || '{}');
  } catch (e) {
    return {};
  }
}

// Shared "toast on next poll" mechanism: anything (market actions, TON
// deposits/withdrawals, admin decisions) can queue a short message for a
// specific user, consumed once by GET /api/notify?user=...
async function notifyUser(requesterId, text, kind) {
  if (!requesterId) return;
  const key = `coolNotify:${requesterId}`;
  const list = await getJSON(key, []);
  list.push({ text, kind, time: Date.now() });
  await setJSON(key, list.slice(-20));
}

// Shared activity log read by the profile's "История" tab (GET
// /api/requests?mine=...) and by the admin panel's requests list.
async function pushHistory(item) {
  const list = await getJSON('coolRequests', []);
  list.unshift(item);
  await setJSON('coolRequests', list.slice(0, 200));
}

module.exports = { redis, getJSON, setJSON, isAdmin, readBody, notifyUser, pushHistory };
