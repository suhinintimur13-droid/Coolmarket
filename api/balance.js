// Returns a user's real GRAM balance, credited automatically when one of
// their NFTs sells on the market (see api/market.js, action "buy").
const { getJSON } = require('../lib/kv');

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'method not allowed' });
      return;
    }
    const user = String(req.query.user || '');
    const balance = await getJSON(`coolBalance:${user}`, 0);
    res.status(200).json({ balance: Number(balance) || 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
