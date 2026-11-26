// Returns the NFTs a given user currently owns and has NOT listed for sale.
const { getJSON } = require('../lib/kv');

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'method not allowed' });
      return;
    }
    const user = String(req.query.user || '');
    if (!user) {
      res.status(400).json({ error: 'user required' });
      return;
    }
    const list = await getJSON(`coolVault:${user}`, []);
    res.status(200).json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
