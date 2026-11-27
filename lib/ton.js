// Real TON blockchain integration.
//
// This replaces any "admin clicks approve" flow for money: deposits are
// verified automatically by reading the blockchain, and withdrawals are sent
// automatically by the server itself. Nobody can fake a balance here.
//
// Required environment variables (set in Vercel -> Project -> Settings ->
// Environment Variables -- NEVER put the mnemonic in chat or in this repo):
//
//   TON_WALLET_ADDRESS       Public address that receives deposits.
//                            (safe to share -- it's public anyway)
//
//   TON_HOT_WALLET_MNEMONIC  The 24 secret words for that SAME wallet, used
//                            to automatically SEND withdrawals. Treat this
//                            like the keys to real money, because it is.
//
//   TON_API_KEY              Optional. Free key from https://toncenter.com
//                            Avoids rate limits on the public endpoint.

const { mnemonicToPrivateKey } = require('@ton/crypto');
const { TonClient, WalletContractV4, internal, Address, beginCell, toNano } = require('@ton/ton');
const { getJSON, setJSON } = require('./kv');

const GRAM_PER_TON = 4; // purchase rate: pay 1 TON, get 4 GRAM

function gramToTon(gram) {
  return gram / GRAM_PER_TON;
}

function tonClient() {
  return new TonClient({
    endpoint: 'https://toncenter.com/api/v2/jsonRPC',
    apiKey: process.env.TON_API_KEY || undefined
  });
}

// Builds the exact base64 "message body" the browser sends along with a
// TonConnect transaction, so a normal TON wallet transfer carries a plain
// text comment (memo) that we can recognize later on-chain.
function buildCommentPayload(memo) {
  const cell = beginCell().storeUint(0, 32).storeStringTail(memo).endCell();
  return cell.toBoc().toString('base64');
}

let hotWalletPromise = null;
async function hotWallet() {
  if (hotWalletPromise) return hotWalletPromise;
  hotWalletPromise = (async () => {
    const phrase = String(process.env.TON_HOT_WALLET_MNEMONIC || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (phrase.length < 24) {
      const err = new Error(
        'TON_HOT_WALLET_MNEMONIC is not set in Vercel env vars (needs the 24 secret words).'
      );
      err.code = 'TON_WALLET_NOT_CONFIGURED';
      throw err;
    }
    const key = await mnemonicToPrivateKey(phrase);
    const wallet = WalletContractV4.create({ publicKey: key.publicKey, workchain: 0 });
    const contract = tonClient().open(wallet);
    return { contract, key };
  })();
  return hotWalletPromise;
}

// Actually sends real TON out of the project wallet. Used for automatic
// withdrawals -- this moves real money, with no human in the loop.
async function sendTon(toAddress, nanoAmount, comment) {
  const { contract, key } = await hotWallet();
  const seqno = await contract.getSeqno();
  await contract.sendTransfer({
    secretKey: key.secretKey,
    seqno,
    messages: [
      internal({
        to: Address.parse(toAddress),
        value: BigInt(nanoAmount),
        bounce: false,
        body: comment || undefined
      })
    ]
  });
  return seqno;
}

// Looks at the project wallet's recent incoming transactions and tries to
// find one whose comment matches `memo` and whose amount is enough. This is
// the "proof" step for a deposit -- nothing is credited without it.
async function findIncomingPayment(memo, minNano) {
  const client = tonClient();
  const walletAddr = Address.parse(process.env.TON_WALLET_ADDRESS);
  const txs = await client.getTransactions(walletAddr, { limit: 40 });
  for (const tx of txs) {
    const inMsg = tx.inMessage;
    if (!inMsg || inMsg.info.type !== 'internal') continue;
    let comment = '';
    try {
      const body = inMsg.body.beginParse();
      if (body.remainingBits >= 32 && body.loadUint(32) === 0) {
        comment = body.loadStringTail().trim();
      }
    } catch (e) {
      // not a plain-text comment message -- ignore
    }
    if (comment === memo && inMsg.info.value.coins >= BigInt(minNano)) {
      return { hash: tx.hash().toString('hex'), value: inMsg.info.value.coins.toString() };
    }
  }
  return null;
}

async function notifyUser(requesterId, text, kind) {
  if (!requesterId) return;
  const key = `coolNotify:${requesterId}`;
  const list = await getJSON(key, []);
  list.push({ text, kind, time: Date.now() });
  await setJSON(key, list.slice(-20));
}

async function pushHistory(item) {
  const list = await getJSON('coolRequests', []);
  list.unshift(item);
  await setJSON('coolRequests', list.slice(0, 200));
}

module.exports = {
  GRAM_PER_TON,
  gramToTon,
  buildCommentPayload,
  sendTon,
  findIncomingPayment,
  notifyUser,
  pushHistory,
  toNano
};
