// Tracks who is currently online, so the front-end can show a live count
// ("Онлайн сейчас: N") and the admin panel can pick a target user to gift
// an NFT to. No real accounts — each browser gets a random persistent id
// (see MY_ID in index.html) and a display name.

const { getJSON, setJSON } = require('../lib/kv');

const ONLINE_WINDOW = 30 * 1000; // consider "online" if seen in the last 30s

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
      const id = String(body.id || '').slice(0, 64);
      const name = String(body.name || 'guest').slice(0, 32);
      if (!id) {
        res.status(400).json({ error: 'bad request' });
        return;
      }
      const map = await getJSON('coolPresence', {});
      map[id] = { name, last: Date.now() };
      const now = Date.now();
      Object.keys(map).forEach((k) => {
        if (now - map[k].last > ONLINE_WINDOW * 6) delete map[k];
      });
      await setJSON('coolPresence', map);
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === 'GET') {
      const map = await getJSON('coolPresence', {});
      const now = Date.now();
      const users = Object.keys(map)
        .filter((k) => now - map[k].last <= ONLINE_WINDOW)
        .map((k) => ({ id: k, name: map[k].name }));
      res.status(200).json({ count: users.length, users });
      return;
    }

    res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
