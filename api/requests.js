// Serverless endpoint for storing deposit/withdraw requests, shared across all visitors.
// Storage: Upstash Redis (connected via Vercel Storage), through lib/kv.js.
//
// Optional: set ADMIN_KEY in Project Settings -> Environment Variables to override the
// default admin password used to protect reading/approving requests (defaults to "92hbwf9",
// matching the front-end's hardcoded login).

const { getJSON, setJSON, isAdmin, readBody } = require('../lib/kv');

module.exports = async function handler(req, res) {
  try {
    async function getList() {
      return await getJSON('coolRequests', []);
    }

    async function saveList(list) {
      await setJSON('coolRequests', list.slice(0, 200));
    }

    if (req.method === 'GET') {
      if (!isAdmin(req)) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      const list = await getList();
      res.status(200).json(list);
      return;
    }

    if (req.method === 'POST') {
      const body = req.body && typeof req.body === 'object' ? req.body : await readBody(req);
      const type = body.type === 'withdraw' ? 'withdraw' : 'deposit';
      const user = String(body.user || '').trim().replace(/^@/, '').slice(0, 64);
      const amount = Number(body.amount) || 0;
      if (!user || amount <= 0) {
        res.status(400).json({ error: 'bad request' });
        return;
      }
      const list = await getList();
      const item = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        type,
        user,
        amount,
        time: Date.now(),
        status: 'pending'
      };
      list.unshift(item);
      await saveList(list);
      res.status(200).json({ ok: true, id: item.id });
      return;
    }

    if (req.method === 'PATCH') {
      if (!isAdmin(req)) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      const body = req.body && typeof req.body === 'object' ? req.body : await readBody(req);
      const list = await getList();
      const idx = list.findIndex((x) => x.id === body.id);
      if (idx === -1) {
        res.status(404).json({ error: 'not found' });
        return;
      }
      if (body.status === 'approved') list[idx].status = 'approved';
      await saveList(list);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
