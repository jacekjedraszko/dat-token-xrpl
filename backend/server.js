const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const xrpl = require('xrpl');

const app = express();
app.use(cors());
app.use(express.json());

const XRPL_TESTNET = 'wss://s.altnet.rippletest.net:51233';
const NOTARY_DESTINATION = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';

// In-memory store for Hackathon PoC (simulates private hospital IPFS cluster)
let wallets = {};
const offChainStore = new Map();

// --- Minimal 2-of-3 Shamir's Secret Sharing over GF(256) ---
function gfMul(a, b) {
  let p = 0;
  for (let i = 0; i < 8; i++) {
    if (b & 1) p ^= a;
    const hi = a & 0x80;
    a = (a << 1) & 0xff;
    if (hi) a ^= 0x1b;
    b >>= 1;
  }
  return p;
}

function gfInv(a) {
  let res = 1, base = a, exp = 254;
  while (exp > 0) {
    if (exp & 1) res = gfMul(res, base);
    base = gfMul(base, base);
    exp >>= 1;
  }
  return res;
}

function splitKey2of3(keyBuf) {
  const shares = [Buffer.alloc(keyBuf.length), Buffer.alloc(keyBuf.length), Buffer.alloc(keyBuf.length)];
  const rand = crypto.randomBytes(keyBuf.length);
  for (let i = 0; i < keyBuf.length; i++) {
    const s = keyBuf[i];
    const r = rand[i];
    shares[0][i] = s ^ gfMul(r, 1); // x = 1 (Patient)
    shares[1][i] = s ^ gfMul(r, 2); // x = 2 (Legal Trustee)
    shares[2][i] = s ^ gfMul(r, 3); // x = 3 (Hospital Node)
  }
  return [
    `1:${shares[0].toString('hex')}`,
    `2:${shares[1].toString('hex')}`,
    `3:${shares[2].toString('hex')}`
  ];
}

function combineShares(shareA, shareB) {
  const [x1Str, hex1] = shareA.split(':');
  const [x2Str, hex2] = shareB.split(':');
  const x1 = parseInt(x1Str, 10), x2 = parseInt(x2Str, 10);
  const b1 = Buffer.from(hex1, 'hex'), b2 = Buffer.from(hex2, 'hex');
  const out = Buffer.alloc(b1.length);
  const l1 = gfMul(x2, gfInv(x1 ^ x2));
  const l2 = gfMul(x1, gfInv(x2 ^ x1));
  for (let i = 0; i < b1.length; i++) {
    out[i] = gfMul(b1[i], l1) ^ gfMul(b2[i], l2);
  }
  return out;
}

// --- AES-256-GCM Helpers ---
function encryptFHIR(dataObj, keyBuf) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf, iv);
  const plaintext = JSON.stringify(dataObj);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv: iv.toString('hex'), tag: tag.toString('hex'), ciphertext: encrypted.toString('hex') };
}

function decryptFHIR(encObj, keyBuf) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuf, Buffer.from(encObj.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(encObj.tag, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encObj.ciphertext, 'hex')),
    decipher.final()
  ]);
  return JSON.parse(decrypted.toString('utf8'));
}

async function withXrpl(fn) {
  const client = new xrpl.Client(XRPL_TESTNET);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.disconnect();
  }
}

// 1. Setup 3 Testnet Wallets (Patient, Trustee, Hospital)
app.post('/api/setup-wallets', async (req, res) => {
  try {
    const result = await withXrpl(async (client) => {
      const [p, t, h] = await Promise.all([
        client.fundWallet(),
        client.fundWallet(),
        client.fundWallet()
      ]);
      wallets = { patient: p.wallet, trustee: t.wallet, hospital: h.wallet };
      return {
        patient: { address: p.wallet.address, did: `did:xrpl:testnet:${p.wallet.address}` },
        trustee: { address: t.wallet.address, did: `did:xrpl:testnet:${t.wallet.address}` },
        hospital: { address: h.wallet.address, did: `did:xrpl:testnet:${h.wallet.address}` }
      };
    });
    res.json({ success: true, wallets: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Encrypt FHIR + Split Key (2-of-3) + Mint XLS-20 Soulbound Token
app.post('/api/dat/mint', async (req, res) => {
  try {
    if (!wallets.patient) return res.status(400).json({ error: 'Initialize wallets first' });
    const fhirDirective = req.body;
    const hash = crypto.createHash('sha256').update(JSON.stringify(fhirDirective)).digest('hex');
    const aesKey = crypto.randomBytes(32);
    const encryptedPayload = encryptFHIR(fhirDirective, aesKey);
    const shares = splitKey2of3(aesKey);
    const cid = `Qm${crypto.createHash('sha256').update(encryptedPayload.ciphertext).digest('hex').slice(0, 44)}`;

    const uriString = `ipfs://${cid}#sha256=${hash}`;

    const mintResult = await withXrpl(async (client) => {
      const tx = {
        TransactionType: 'NFTokenMint',
        Account: wallets.patient.address,
        URI: xrpl.convertStringToHex(uriString),
        Flags: 1, // tfBurnable ONLY (Non-transferable Soulbound Token)
        NFTokenTaxon: 219 // Italian Law 219/2017
      };
      const response = await client.submitAndWait(tx, { wallet: wallets.patient });
      const nfts = await client.request({ command: 'account_nfts', account: wallets.patient.address });
      const latestNft = nfts.result.account_nfts[nfts.result.account_nfts.length - 1];
      return { txHash: response.result.hash, nfTokenID: latestNft.NFTokenID };
    });

    offChainStore.set(mintResult.nfTokenID, { cid, hash, encryptedPayload });

    res.json({
      success: true,
      nfTokenID: mintResult.nfTokenID,
      txHash: mintResult.txHash,
      explorerUrl: `https://testnet.xrpl.org/transactions/${mintResult.txHash}`,
      cid,
      hash,
      shares: { patient: shares[0], trustee: shares[1], hospital: shares[2] }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. ER Break-the-Glass Verification & Tampering Security Alert
app.post('/api/dat/verify', async (req, res) => {
  try {
    const { nfTokenID, shareA, shareB, simulateTampering } = req.body;
    const record = offChainStore.get(nfTokenID);
    if (!record) return res.status(404).json({ error: 'Off-chain record not found or crypto-shredded' });

    const reconstructedKey = combineShares(shareA, shareB);
    let decryptedFHIR = decryptFHIR(record.encryptedPayload, reconstructedKey);

    if (simulateTampering) {
      decryptedFHIR = { ...decryptedFHIR, invasiveVentilation: !decryptedFHIR.invasiveVentilation };
    }

    const recomputedHash = crypto.createHash('sha256').update(JSON.stringify(decryptedFHIR)).digest('hex');

    // Fetch on-chain URI hash from XRPL
    const onChainHash = await withXrpl(async (client) => {
      const nfts = await client.request({ command: 'account_nfts', account: wallets.patient.address });
      const token = nfts.result.account_nfts.find((n) => n.NFTokenID === nfTokenID);
      if (!token) throw new Error('Token revoked or not found on XRPL');
      const decodedUri = Buffer.from(token.URI, 'hex').toString('utf8');
      return decodedUri.split('#sha256=')[1];
    });

    if (recomputedHash !== onChainHash) {
      // Broadcast immutable SECURITY_ALERT_HASH_MISMATCH to XRPL Testnet
      const alertTxHash = await withXrpl(async (client) => {
        const memoPayload = JSON.stringify({
          alert: 'SECURITY_ALERT_HASH_MISMATCH',
          nfTokenID,
          expectedHash: onChainHash,
          detectedHash: recomputedHash,
          timestamp: new Date().toISOString()
        });
        const tx = {
          TransactionType: 'Payment',
          Account: wallets.hospital.address,
          Destination: NOTARY_DESTINATION,
          Amount: '1',
          Memos: [{
            Memo: {
              MemoType: xrpl.convertStringToHex('SECURITY_ALERT_HASH_MISMATCH'),
              MemoData: xrpl.convertStringToHex(memoPayload)
            }
          }]
        };
        const resp = await client.submitAndWait(tx, { wallet: wallets.hospital });
        return resp.result.hash;
      });

      return res.json({
        verified: false,
        tampered: true,
        alertTxHash,
        explorerUrl: `https://testnet.xrpl.org/transactions/${alertTxHash}`,
        message: 'CRITICAL: Off-chain hash mismatch detected. Clinical display blocked.'
      });
    }

    res.json({ verified: true, tampered: false, directive: decryptedFHIR, hash: recomputedHash });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. GDPR Art. 17 Revocation (NFTokenBurn + Off-Chain Crypto-Shredding)
app.post('/api/dat/revoke', async (req, res) => {
  try {
    const { nfTokenID } = req.body;
    const burnTxHash = await withXrpl(async (client) => {
      const tx = {
        TransactionType: 'NFTokenBurn',
        Account: wallets.patient.address,
        NFTokenID: nfTokenID
      };
      const resp = await client.submitAndWait(tx, { wallet: wallets.patient });
      return resp.result.hash;
    });

    offChainStore.delete(nfTokenID); // Crypto-shredding

    res.json({
      success: true,
      burnTxHash,
      explorerUrl: `https://testnet.xrpl.org/transactions/${burnTxHash}`,
      message: 'NFToken burned on XRPL and off-chain keys destroyed (GDPR Art. 17).'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = 3001;
app.listen(PORT, () => console.log(`DAT-Token XRPL Backend running on http://localhost:${PORT}`));