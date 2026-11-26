function findKvCreds() {
  const exactPairs = [
    ['KV_REST_API_URL', 'KV_REST_API_TOKEN'],
    ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']
  ];
  for (const [u, t] of exactPairs) {
    if (process.env[u] && process.env[t]) {
      return { url: process.env[u], token: process.env[t] };
    }
  }
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
    const err = new Error('Storage not configured. Connect an Upstash (Redis) database to this project in Vercel -> Storage, then redeploy.');
    err.code = 'KV_NOT_CONFIGURED';
    throw err;
  }
  const { url, token } = creds;
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd)
  });
  const j = await r.json();
  return j.result;
}

async function getJSON(key, fallback) {
  try {
    const val = await redis(['GET', key]);
    if (val === null || val === undefined) return fallback;
    return JSON.parse(val);
  } catch (e) {
    if (e.code === 'KV_NOT_CONFIGURED') throw e;
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
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch (e) {
        resolve({});
      }
    });
  });
}

module.exports = { redis, getJSON, setJSON, isAdmin, readBody };
