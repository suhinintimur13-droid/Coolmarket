// Admin-only: creates an NFT with the given stats and drops it straight into
// a specific (currently online) user's vault.
const { getJSON, setJSON, isAdmin, readBody } = require('../../lib/kv');

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method not allowed' });
      return;
    }
    if (!isAdmin(req)) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const body = req.body && typeof req.body === 'object' ? req.body : await readBody(req);
    const targetId = String(body.targetId || '');
    const nft = body.nft || {};
    const name = String(nft.name || '').trim().slice(0, 60);
    const img = String(nft.img || '');
    const model = String(nft.model || '').trim().slice(0, 40);
    const bg = String(nft.bg || '').trim().slice(0, 80);
    const symbol = String(nft.symbol || '').trim().slice(0, 40);
    // Optional admin-chosen edition number (e.g. "103645", shown as "#103645").
    // Digits only, capped at 9 characters. If left blank, the front-end
    // derives a stable display number from the item's id instead.
    const num = String(nft.num || '').replace(/[^0-9]/g, '').slice(0, 9);

    if (!targetId || !name || !img) {
      res.status(400).json({ error: 'bad request' });
      return;
    }
    if (img.length > 600000) {
      res.status(400).json({ error: 'image too large' });
      return;
    }

    const item = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      name,
      img,
      model,
      bg,
      symbol,
      num
    };
    const vault = await getJSON(`coolVault:${targetId}`, []);
    vault.unshift(item);
    await setJSON(`coolVault:${targetId}`, vault);
    res.status(200).json({ ok: true, item });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
