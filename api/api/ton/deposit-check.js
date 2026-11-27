// Step 2: the browser polls this after sending the TonConnect transaction.
// We check the real blockchain ourselves -- nobody has to click "approve",
// and nobody (including the admin) can credit a balance without a matching
// on-chain payment actually existing.
const { getJSON, setJSON } = require('../../lib/kv');
const { findIncomingPayment, notifyUser, pushHistory } = require('../../lib/ton');

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'method not allowed' });
      return;
    }
    const memo = String(req.query.memo || '');
    if (!memo) {
      res.status(400).json({ error: 'memo required' });
      return;
    }

    const intent = await getJSON(`tonDeposit:${memo}`, null);
    if (!intent) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    if (intent.status === 'confirmed') {
      res.status(200).json({ status: 'confirmed', gramAmount: intent.gramAmount });
      return;
    }

    const found = await findIncomingPayment(memo, intent.nano);
    if (!found) {
      res.status(200).json({ status: 'pending' });
      return;
    }

    // A transaction hash can only ever credit a balance once.
    const usedKey = `tonTxUsed:${found.hash}`;
    const already = await getJSON(usedKey, false);
    if (already) {
      res.status(200).json({ status: 'pending' });
      return;
    }
    await setJSON(usedKey, true);

    intent.status = 'confirmed';
    intent.txHash = found.hash;
    await setJSON(`tonDeposit:${memo}`, intent);

    const balKey = `coolBalance:${intent.userId}`;
    const bal = Number(await getJSON(balKey, 0)) || 0;
    await setJSON(balKey, bal + intent.gramAmount);

    await pushHistory({
      id: memo,
      type: 'deposit',
      user: intent.userId,
      amount: intent.gramAmount,
      requesterId: intent.userId,
      time: Date.now(),
      status: 'approved'
    });
    await notifyUser(
      intent.userId,
      `Зачислено ${intent.gramAmount} GRAM (оплата ${intent.tonAmount} TON подтверждена в блокчейне)`,
      'ok'
    );

    res.status(200).json({ status: 'confirmed', gramAmount: intent.gramAmount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
