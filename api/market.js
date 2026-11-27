// The shared marketplace: list an NFT for sale, buy one, or cancel a listing.
// Trust model: like the rest of this demo, there is no real login for
// regular users — whoever calls the API with a given id can act as that
// id. Fine for a hobby project, not for anything handling real money.
const { getJSON, setJSON, readBody, pushHistory } = require('../lib/kv');

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const market = await getJSON('coolMarket', []);
      res.status(200).json(market);
      return;
    }

    if (req.method === 'POST') {
      const body = req.body && typeof req.body === 'object' ? req.body : await readBody(req);
      const action = body.action;

      if (action === 'list') {
        const ownerId = String(body.ownerId || '');
        const ownerName = String(body.ownerName || 'user').slice(0, 32);
        const nftId = String(body.nftId || '');
        const price = Number(body.price) || 0;
        if (!ownerId || !nftId || price <= 0) {
          res.status(400).json({ error: 'bad request' });
          return;
        }
        const vault = await getJSON(`coolVault:${ownerId}`, []);
        const idx = vault.findIndex((x) => x.id === nftId);
        if (idx === -1) {
          res.status(404).json({ error: 'nft not found in vault' });
          return;
        }
        const nft = vault[idx];
        vault.splice(idx, 1);
        await setJSON(`coolVault:${ownerId}`, vault);
        const market = await getJSON('coolMarket', []);
        market.unshift({ ...nft, price, ownerId, ownerName, listedAt: Date.now() });
        await setJSON('coolMarket', market);
        await pushHistory({
          id: 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          type: 'list',
          user: ownerName || ownerId,
          amount: price,
          requesterId: ownerId,
          nftName: nft.name,
          time: Date.now(),
          status: 'approved'
        });
        res.status(200).json({ ok: true });
        return;
      }

      if (action === 'unlist') {
        const ownerId = String(body.ownerId || '');
        const nftId = String(body.nftId || '');
        if (!ownerId || !nftId) {
          res.status(400).json({ error: 'bad request' });
          return;
        }
        const market = await getJSON('coolMarket', []);
        const idx = market.findIndex((x) => x.id === nftId && x.ownerId === ownerId);
        if (idx === -1) {
          res.status(404).json({ error: 'not found' });
          return;
        }
        const listing = market[idx];
        market.splice(idx, 1);
        await setJSON('coolMarket', market);
        const { price, ownerId: _o, ownerName: listedAsName, listedAt, ...nft } = listing;
        const vault = await getJSON(`coolVault:${ownerId}`, []);
        vault.unshift(nft);
        await setJSON(`coolVault:${ownerId}`, vault);
        await pushHistory({
          id: 'U' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          type: 'unlist',
          user: listedAsName || ownerId,
          amount: price,
          requesterId: ownerId,
          nftName: nft.name,
          time: Date.now(),
          status: 'approved'
        });
        res.status(200).json({ ok: true });
        return;
      }

      if (action === 'buy') {
        const buyerId = String(body.buyerId || '');
        const buyerName = String(body.buyerName || 'user').slice(0, 32);
        const nftId = String(body.nftId || '');
        if (!buyerId || !nftId) {
          res.status(400).json({ error: 'bad request' });
          return;
        }
        const market = await getJSON('coolMarket', []);
        const idx = market.findIndex((x) => x.id === nftId);
        if (idx === -1) {
          res.status(404).json({ error: 'not found' });
          return;
        }
        const listing = market[idx];
        if (listing.ownerId === buyerId) {
          res.status(400).json({ error: 'cannot buy your own nft' });
          return;
        }
        market.splice(idx, 1);
        await setJSON('coolMarket', market);
        const { price, ownerId, ownerName, listedAt, ...nft } = listing;
        const buyerVault = await getJSON(`coolVault:${buyerId}`, []);
        buyerVault.unshift(nft);
        await setJSON(`coolVault:${buyerId}`, buyerVault);
        const sellerBal = await getJSON(`coolBalance:${ownerId}`, 0);
        await setJSON(`coolBalance:${ownerId}`, (Number(sellerBal) || 0) + price);
        await pushHistory({
          id: 'B' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          type: 'buy',
          user: buyerName || buyerId,
          amount: price,
          requesterId: buyerId,
          nftName: nft.name,
          time: Date.now(),
          status: 'approved'
        });
        await pushHistory({
          id: 'S' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          type: 'sale',
          user: ownerName || ownerId,
          amount: price,
          requesterId: ownerId,
          nftName: nft.name,
          time: Date.now(),
          status: 'approved'
        });
        res.status(200).json({ ok: true });
        return;
      }

      if (action === 'reprice') {
        const ownerId = String(body.ownerId || '');
        const ownerName = String(body.ownerName || 'user').slice(0, 32);
        const nftId = String(body.nftId || '');
        const price = Number(body.price) || 0;
        if (!ownerId || !nftId || price <= 0) {
          res.status(400).json({ error: 'bad request' });
          return;
        }
        const market = await getJSON('coolMarket', []);
        const idx = market.findIndex((x) => x.id === nftId && x.ownerId === ownerId);
        if (idx === -1) {
          res.status(404).json({ error: 'not found' });
          return;
        }
        const oldPrice = market[idx].price;
        market[idx].price = price;
        await setJSON('coolMarket', market);
        await pushHistory({
          id: 'R' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          type: 'reprice',
          user: ownerName || ownerId,
          amount: price,
          oldAmount: oldPrice,
          requesterId: ownerId,
          nftName: market[idx].name,
          time: Date.now(),
          status: 'approved'
        });
        res.status(200).json({ ok: true });
        return;
      }

      res.status(400).json({ error: 'unknown action' });
      return;
    }

    res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
