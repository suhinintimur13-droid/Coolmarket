// Serverless endpoint for storing deposit/withdraw requests, shared across all visitors.
// Storage: Upstash Redis (connected via Vercel Storage), through lib/kv.js.
//
// Optional: set ADMIN_KEY in Project Settings -> Environment Variables to override the
// default admin password used to protect reading/approving requests (defaults to "92hbwf9",
// matching the front-end's hardcoded login).

const { getJSON, setJSON, isAdmin, readBody } = require('../lib/kv');

async function notify(requesterId, text, kind) {
  if (!requesterId) return;
  const key = `coolNotify:${requesterId}`;
  const list = await getJSON(key, []);
  list.push({ text, kind, time: Date.now() });
  await setJSON(key, list.slice(-20));
}

module.exports = async function handler(req, res) {
  try {
    async function getList() {
      return await getJSON('coolRequests', []);
    }

    async function saveList(list) {
      await setJSON('coolRequests', list.slice(0, 200));
    }

    if (req.method === 'GET') {
      const mine = String(req.query.mine || '');
      if (mine) {
        const list = await getList();
        const own = list.filter((x) => x.requesterId === mine).slice(0, 50);
        res.status(200).json(own);
        return;
      }
      // Public global activity feed (listings, sales, purchases, delistings,
      // price changes) -- deliberately open to everyone, no admin key needed,
      // like a real marketplace activity feed. Deposit/withdraw requests are
      // financial and stay admin-only below, so this only exposes market
      // events, never anyone's money requests.
      if (String(req.query.feed || '') === 'market') {
        const marketTypes = ['list', 'unlist', 'buy', 'sale', 'reprice'];
        const list = await getList();
        const feed = list.filter((x) => marketTypes.indexOf(x.type) !== -1).slice(0, 80);
        res.status(200).json(feed);
        return;
      }
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
      const requesterId = String(body.requesterId || '').slice(0, 64);
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
        requesterId,
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
      const status = body.status === 'rejected' ? 'rejected' : body.status === 'approved' ? 'approved' : null;
      if (!status) {
        res.status(400).json({ error: 'bad status' });
        return;
      }
      list[idx].status = status;
      await saveList(list);

      const item = list[idx];
      const typeLabel = item.type === 'withdraw' ? 'на вывод' : 'на пополнение';
      if (status === 'approved') {
        await notify(item.requesterId, `Заявка ${typeLabel} ${item.amount} GRAM принята`, 'ok');
      } else {
        await notify(item.requesterId, `Заявка ${typeLabel} ${item.amount} GRAM отклонена`, 'bad');
      }

      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
