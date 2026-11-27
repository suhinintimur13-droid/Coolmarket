// Step 1 of a real deposit: reserve a unique memo + exact TON amount for this
// user. The browser then asks their wallet (via TonConnect) to send that
// exact payment with that exact memo. Nothing is credited yet here.
const { setJSON, readBody } = require('../../lib/kv');
const { gramToTon, buildCommentPayload, toNano } = require('../../lib/ton');

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method not allowed' });
      return;
    }
    const body = req.body && typeof req.body === 'object' ? req.body : await readBody(req);
    const userId = String(body.userId || '').slice(0, 64);
    const gramAmount = Math.round(Number(body.gramAmount) || 0);
    if (!userId || gramAmount <= 0) {
      res.status(400).json({ error: 'bad request' });
      return;
    }
    if (!process.env.TON_WALLET_ADDRESS) {
      res.status(500).json({ error: 'TON_WALLET_ADDRESS not configured on the server' });
      return;
    }

    const tonAmount = gramToTon(gramAmount);
    const nano = toNano(tonAmount.toFixed(9)).toString();
    const memo = 'D' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    await setJSON(`tonDeposit:${memo}`, {
      userId,
      gramAmount,
      tonAmount,
      nano,
      status: 'pending',
      time: Date.now()
    });

    res.status(200).json({
      address: process.env.TON_WALLET_ADDRESS,
      amountNano: nano,
      tonAmount,
      payload: buildCommentPayload(memo),
      memo
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
