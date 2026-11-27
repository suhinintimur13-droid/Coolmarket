// Automatic on-chain withdrawal. Per the project owner's choice, there is no
// manual review step and no amount cap -- the server deducts the balance and
// sends real TON itself the moment this is called, using the hot wallet
// configured via TON_HOT_WALLET_MNEMONIC (Vercel env var, never in chat/repo).
const { getJSON, setJSON, readBody } = require('../../lib/kv');
const { sendTon, gramToTon, toNano, notifyUser, pushHistory } = require('../../lib/ton');

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method not allowed' });
      return;
    }
    const body = req.body && typeof req.body === 'object' ? req.body : await readBody(req);
    const userId = String(body.userId || '').slice(0, 64);
    const toAddress = String(body.toAddress || '').trim();
    const gramAmount = Math.round(Number(body.gramAmount) || 0);
    if (!userId || !toAddress || gramAmount <= 0) {
      res.status(400).json({ error: 'bad request' });
      return;
    }

    // Prevent the same user firing two withdrawals at once (double-spend).
    const lockKey = `tonWithdrawLock:${userId}`;
    const locked = await getJSON(lockKey, false);
    if (locked) {
      res.status(429).json({ error: 'a withdrawal is already in progress for this user' });
      return;
    }
    await setJSON(lockKey, true);

    try {
      const balKey = `coolBalance:${userId}`;
      const bal = Number(await getJSON(balKey, 0)) || 0;
      if (bal < gramAmount) {
        res.status(400).json({ error: 'insufficient balance' });
        return;
      }

      // Deduct first so a slow request can't be fired twice against the same balance.
      await setJSON(balKey, bal - gramAmount);
      const tonAmount = gramToTon(gramAmount);
      const nano = toNano(tonAmount.toFixed(9));

      try {
        await sendTon(toAddress, nano, 'COOL withdraw');
        await pushHistory({
          id: 'W' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          type: 'withdraw',
          user: userId,
          amount: gramAmount,
          requesterId: userId,
          time: Date.now(),
          status: 'approved'
        });
        await notifyUser(
          userId,
          `Выведено ${gramAmount} GRAM (${tonAmount} TON отправлено на ваш кошелёк)`,
          'ok'
        );
        res.status(200).json({ ok: true, tonAmount });
      } catch (sendErr) {
        // The transfer never left the wallet -- give the balance back.
        const cur = Number(await getJSON(balKey, 0)) || 0;
        await setJSON(balKey, cur + gramAmount);
        await pushHistory({
          id: 'W' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          type: 'withdraw',
          user: userId,
          amount: gramAmount,
          requesterId: userId,
          time: Date.now(),
          status: 'rejected'
        });
        await notifyUser(
          userId,
          `Вывод ${gramAmount} GRAM не прошёл, баланс возвращён (${sendErr.message})`,
          'bad'
        );
        res.status(500).json({ error: 'transfer failed: ' + sendErr.message });
      }
    } finally {
      await setJSON(lockKey, false);
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
