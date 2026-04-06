/**
 * Live end-to-end integration test for the full reservation flow.
 *
 * Prerequisites:
 *   1. Set TEST_EVM_PRIVATE_KEY in .env (Sepolia wallet with ETH for gas)
 *   2. Set TEST_LTC_PRIVATE_KEY in .env (32-byte hex, for a funded P2WPKH LTC testnet wallet)
 *   3. Set TEST_LTC_UTXO_TXID, TEST_LTC_UTXO_VOUT, TEST_LTC_UTXO_AMOUNT_SATS in .env
 *      (fund the P2WPKH address printed at test start, then set these to the funding UTXO)
 *   4. Set FLORIN_API_URL in .env (default: http://35.239.92.14:8080)
 *   5. Ensure the MM has an active position with available P2TR addresses
 *
 * Run with:
 *   npx jest tests/live-e2e.test.ts --forceExit --verbose
 *
 * The test times out after 20 minutes (waiting for LTC blocks and florin-mm settlement).
 */

import dotenv from 'dotenv';
// Load .env (not .env.test — we need real chain IDs)
dotenv.config({ path: ['.env'] });

import { ethers } from 'ethers';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import ECPairFactory from 'ecpair';
import axios from 'axios';
import { exchangeAbi } from '../src/abis/exchange';

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

// ─── Config ─────────────────────────────────────────────────────────────────

const SEPOLIA_RPC         = process.env.PROVIDER_URL     || 'https://sepolia.drpc.org';
const CONTRACT_ADDRESS    = process.env.CONTRACT_ADDRESS || '0x15EF38c3e42150e8B0156C22f27f93B26804e3bd';
const MM_PROXY_ADDRESS    = process.env.MARKET_MAKER_PROXY_ADDRESS || '0xF1298765683B8fC68DE71429319FE162b939Ef51';
const TATUM_URL           = process.env.BTC_NODE_HOST    || 'https://litecoin-testnet.gateway.tatum.io';
const TATUM_KEY           = process.env.BTC_NODE_PASSWORD;
const FLORIN_API          = process.env.FLORIN_API_URL   || 'http://35.239.92.14:8080';

const TEST_EVM_PRIVATE_KEY = process.env.TEST_EVM_PRIVATE_KEY;
const TEST_LTC_PRIVATE_KEY = process.env.TEST_LTC_PRIVATE_KEY; // 32-byte hex, no 0x prefix

// Pre-funded LTC UTXO. After the test runs, update these to the change output.
const TEST_LTC_UTXO_TXID      = process.env.TEST_LTC_UTXO_TXID;
const TEST_LTC_UTXO_VOUT      = Number(process.env.TEST_LTC_UTXO_VOUT ?? '0');
const TEST_LTC_UTXO_AMOUNT_SATS = Number(process.env.TEST_LTC_UTXO_AMOUNT_SATS ?? '0');

// LTC testnet network params
const LTC_TESTNET: bitcoin.networks.Network = {
    messagePrefix: '\x19Litecoin Signed Message:\n',
    bech32: 'tltc',
    bip32:  { public: 0x043587CF, private: 0x04358394 },
    pubKeyHash: 0x6f,
    scriptHash: 0x3a,
    wif: 0xef,
};

const FEE_SATS      = 10_000;  // 0.0001 LTC tx fee
const PAYMENT_SATS  = 20_000;  // 0.0002 LTC to send to the reservation address
const TOKEN_AMOUNT  = BigInt(PAYMENT_SATS) * 10n**10n; // sats × 10^10 = EVM token units

// Timeouts / polling
const POLL_MS       = 30_000;  // 30 s between polls
const PHASE_TIMEOUT = 60 * 60 * 1000; // 60 min per phase (LTC testnet blocks can be very slow)
const TOTAL_TIMEOUT = 120 * 60 * 1000; // 120 min total

// ─── Helpers ────────────────────────────────────────────────────────────────

function ts(): string {
    return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function progress(msg: string) {
    console.log(`\n[${ts()}] ${msg}`);
}

async function ltcRpc(method: string, ...params: unknown[]): Promise<unknown> {
    for (let attempt = 0; attempt < 3; attempt++) {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (TATUM_KEY) headers['x-api-key'] = TATUM_KEY;
        const resp = await axios.post(TATUM_URL, { jsonrpc: '2.0', method, params, id: 1 }, { headers, timeout: 20_000 });
        const data = resp.data as { result: unknown; error?: { message: string } };
        if (data.error) {
            if (resp.status === 429) { await sleep(1000 * (attempt + 1)); continue; }
            throw new Error(`LTC RPC ${method}: ${data.error.message}`);
        }
        return data.result;
    }
    throw new Error(`LTC RPC ${method}: rate-limited after 3 attempts`);
}

async function sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}

/**
 * Poll `fn` every POLL_MS until it returns truthy or timeoutMs elapses.
 * Calls `onPoll(result)` on each attempt regardless.
 */
async function pollUntil<T>(
    label: string,
    fn: () => Promise<T>,
    isComplete: (v: T) => boolean,
    onPoll: (v: T, attempt: number) => void,
    timeoutMs: number = PHASE_TIMEOUT,
): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    let attempt = 0;
    while (Date.now() < deadline) {
        attempt++;
        try {
            const result = await fn();
            onPoll(result, attempt);
            if (isComplete(result)) return result;
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            progress(`  [${label}] poll ${attempt} error: ${msg}`);
        }
        if (Date.now() + POLL_MS < deadline) await sleep(POLL_MS);
    }
    throw new Error(`[${label}] timed out after ${timeoutMs / 1000}s (${attempt} attempts)`);
}

/** Build a P2WPKH → P2TR transaction and return its hex. */
function buildLtcTx(
    privKeyHex: string,
    utxoTxid: string,
    utxoVout: number,
    utxoAmountSats: number,
    recipientScriptHex: string, // P2TR scriptPubKey ("5120...")
    paymentSats: number,
): string {
    const privKeyBuf = Buffer.from(privKeyHex, 'hex');
    const keyPair    = ECPair.fromPrivateKey(privKeyBuf, { network: LTC_TESTNET });
    // bitcoinjs-lib expects Buffer, but ecpair returns Uint8Array — wrap it
    const pubkeyBuf  = Buffer.from(keyPair.publicKey);
    const signer     = { publicKey: pubkeyBuf, sign: (hash: Buffer) => Buffer.from(keyPair.sign(hash)) };
    const p2wpkh     = bitcoin.payments.p2wpkh({ pubkey: pubkeyBuf, network: LTC_TESTNET });

    const psbt = new bitcoin.Psbt({ network: LTC_TESTNET });

    psbt.addInput({
        hash: utxoTxid,
        index: utxoVout,
        witnessUtxo: { script: p2wpkh.output!, value: utxoAmountSats },
    });

    // Payment to reservation P2TR address
    psbt.addOutput({ script: Buffer.from(recipientScriptHex, 'hex'), value: paymentSats });

    // Change back to sender
    const changeSats = utxoAmountSats - paymentSats - FEE_SATS;
    if (changeSats < 0) throw new Error(`Insufficient UTXO: ${utxoAmountSats} sats < ${paymentSats + FEE_SATS}`);
    if (changeSats > 546) { // dust threshold
        psbt.addOutput({ script: p2wpkh.output!, value: changeSats });
    }

    psbt.signInput(0, signer);
    psbt.finalizeAllInputs();
    return psbt.extractTransaction().toHex();
}

/** GET /reservation/:id — returns null if 404. */
async function getReservation(id: string): Promise<Record<string, unknown> | null> {
    try {
        const r = await axios.get(`${FLORIN_API}/reservation/${id}`, { timeout: 10_000 });
        return r.data?.data ?? r.data;
    } catch (e: unknown) {
        if (axios.isAxiosError(e) && e.response?.status === 404) return null;
        throw e;
    }
}

/** GET /history/:address */
async function getHistory(address: string): Promise<unknown[]> {
    const r = await axios.get(`${FLORIN_API}/history/${address}`, { timeout: 10_000 });
    return Array.isArray(r.data) ? r.data : [];
}

// ─── Test ────────────────────────────────────────────────────────────────────

describe('Live E2E: full reservation flow', () => {

    it('user creates reservation, sends LTC, florin indexes and florin-mm settles', async () => {

        // ── 0. Guard rails ─────────────────────────────────────────────────
        if (!TEST_EVM_PRIVATE_KEY) throw new Error('Set TEST_EVM_PRIVATE_KEY in .env');
        if (!TEST_LTC_PRIVATE_KEY) throw new Error('Set TEST_LTC_PRIVATE_KEY in .env');
        if (!TEST_LTC_UTXO_TXID)   throw new Error('Set TEST_LTC_UTXO_TXID in .env');
        if (!TEST_LTC_UTXO_AMOUNT_SATS || TEST_LTC_UTXO_AMOUNT_SATS < PAYMENT_SATS + FEE_SATS) {
            throw new Error(`TEST_LTC_UTXO_AMOUNT_SATS must be > ${PAYMENT_SATS + FEE_SATS} sats`);
        }

        // ── 1. Wallet setup ────────────────────────────────────────────────
        progress('=== STEP 1: Wallet setup ===');

        const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
        const evmWallet = new ethers.Wallet(TEST_EVM_PRIVATE_KEY, provider);

        const ltcKeyPair = ECPair.fromPrivateKey(Buffer.from(TEST_LTC_PRIVATE_KEY, 'hex'), { network: LTC_TESTNET });
        const ltcP2wpkh  = bitcoin.payments.p2wpkh({ pubkey: Buffer.from(ltcKeyPair.publicKey), network: LTC_TESTNET });
        const ltcAddress = ltcP2wpkh.address!;

        const evmBalance = await provider.getBalance(evmWallet.address);
        const ltcBlock   = await ltcRpc('getblockcount') as number;

        progress(`EVM wallet:   ${evmWallet.address}`);
        progress(`EVM balance:  ${ethers.formatEther(evmBalance)} ETH (Sepolia)`);
        progress(`LTC wallet:   ${ltcAddress} (P2WPKH testnet)`);
        progress(`LTC UTXO:     txid=${TEST_LTC_UTXO_TXID} vout=${TEST_LTC_UTXO_VOUT} amount=${TEST_LTC_UTXO_AMOUNT_SATS} sats`);
        progress(`LTC tip:      block ${ltcBlock}`);
        progress(`Florin API:   ${FLORIN_API}`);

        // Verify UTXO is unspent
        progress('\nVerifying LTC UTXO is unspent…');
        const txout = await ltcRpc('gettxout', TEST_LTC_UTXO_TXID, TEST_LTC_UTXO_VOUT, true) as Record<string, unknown> | null;
        if (!txout) throw new Error(`UTXO ${TEST_LTC_UTXO_TXID}:${TEST_LTC_UTXO_VOUT} is already spent or not found. Fund the LTC address ${ltcAddress} and update TEST_LTC_UTXO_* in .env`);
        progress(`  UTXO confirmed: ${JSON.stringify(txout.value)} LTC, confirmations=${txout.confirmations}`);

        expect(evmBalance).toBeGreaterThan(0n);

        // ── 2. Find active MM position ─────────────────────────────────────
        progress('\n=== STEP 2: Find active position ===');

        const positionId = await provider.getStorage(MM_PROXY_ADDRESS, 3);
        if (positionId === ethers.ZeroHash) throw new Error('No position in MM proxy (slot 3 is zero)');

        const exchangeContract = new ethers.Contract(CONTRACT_ADDRESS, exchangeAbi, provider);

        const [contractPosition, availableCount] = await Promise.all([
            exchangeContract.getPosition(positionId),
            exchangeContract.getAvailableP2trAddressesCount(positionId).catch(() => -1),
        ]);

        progress(`Position ID:       ${positionId}`);
        progress(`Position status:   ${contractPosition.status} (1=Active)`);
        progress(`Original amount:   ${contractPosition.originalAmount}`);
        progress(`Available amount:  ${contractPosition.availableAmount}`);
        progress(`Available P2TR addresses: ${availableCount}`);

        if (contractPosition.status !== 1n && contractPosition.status !== 1) {
            throw new Error(`Position status=${contractPosition.status} is not Active (1). MM may need to create a new position.`);
        }
        if (availableCount === 0) {
            throw new Error('Position has 0 available P2TR addresses. MM needs to push more addresses.');
        }

        // ── 3. Create reservation on-chain ────────────────────────────────
        progress('\n=== STEP 3: Creating reservation on Sepolia ===');

        const exchangeWithSigner = new ethers.Contract(CONTRACT_ADDRESS, exchangeAbi, evmWallet);

        progress(`Calling reservePosition(${positionId}, ${evmWallet.address}, ${TOKEN_AMOUNT})…`);

        const tx = await exchangeWithSigner.reservePosition(positionId, evmWallet.address, TOKEN_AMOUNT);
        progress(`Tx sent: ${tx.hash} — waiting for confirmation…`);

        const receipt = await tx.wait();
        progress(`Confirmed in block ${receipt.blockNumber} (gas used: ${receipt.gasUsed})`);

        // Parse ReservationCreated event
        const iface = new ethers.Interface(exchangeAbi);
        let reservationId: string | null = null;
        let bitcoinAddressBytes32: string | null = null;

        for (const log of receipt.logs) {
            try {
                const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
                if (parsed?.name === 'ReservationCreated') {
                    reservationId      = parsed.args.reservationId;
                    bitcoinAddressBytes32 = parsed.args.bitcoinAddresses;
                    progress(`ReservationCreated event parsed:`);
                    progress(`  reservationId:    ${reservationId}`);
                    progress(`  positionId:       ${parsed.args.positionId}`);
                    progress(`  ownerAddress:     ${parsed.args.ownerAddress}`);
                    progress(`  amount:           ${parsed.args.amount}`);
                    progress(`  bitcoinAddresses: ${bitcoinAddressBytes32}`);
                    progress(`  depositAmount:    ${parsed.args.depositAmount}`);
                }
            } catch { /* skip non-matching logs */ }
        }

        if (!reservationId || !bitcoinAddressBytes32) {
            throw new Error('ReservationCreated event not found in tx receipt');
        }

        // Convert bytes32 → P2TR scriptPubKey hex ("5120" + 32 bytes)
        const bitcoinAddressHex = bitcoinAddressBytes32.startsWith('0x')
            ? bitcoinAddressBytes32.slice(2)
            : bitcoinAddressBytes32;
        const p2trScriptHex = '5120' + bitcoinAddressHex;

        progress(`\nLTC destination scriptPubKey: ${p2trScriptHex}`);

        // ── 4. Wait for florin-fe-be to index the reservation ─────────────
        progress('\n=== STEP 4: Waiting for florin-fe-be to index reservation ===');
        progress(`Polling GET ${FLORIN_API}/reservation/${reservationId} every ${POLL_MS / 1000}s…`);

        const indexedReservation = await pollUntil(
            'index reservation',
            () => getReservation(reservationId!),
            r => r !== null,
            (r, attempt) => {
                if (r) {
                    progress(`  [attempt ${attempt}] Reservation indexed! state=${r.state}`);
                } else {
                    progress(`  [attempt ${attempt}] Not yet indexed (404)…`);
                }
            },
            PHASE_TIMEOUT,
        );

        progress(`\nReservation indexed by florin-fe-be:`);
        console.log(JSON.stringify(indexedReservation, null, 2));

        // ── 5. Send LTC ───────────────────────────────────────────────────
        progress('\n=== STEP 5: Sending LTC ===');
        progress(`Building P2WPKH → P2TR transaction`);
        progress(`  From:   ${ltcAddress}`);
        progress(`  To:     scriptPubKey ${p2trScriptHex}`);
        progress(`  Amount: ${PAYMENT_SATS} sats (${PAYMENT_SATS / 1e8} LTC)`);
        progress(`  Fee:    ${FEE_SATS} sats`);

        const rawTx = buildLtcTx(
            TEST_LTC_PRIVATE_KEY!,
            TEST_LTC_UTXO_TXID,
            TEST_LTC_UTXO_VOUT,
            TEST_LTC_UTXO_AMOUNT_SATS,
            p2trScriptHex,
            PAYMENT_SATS,
        );
        progress(`Raw tx: ${rawTx.slice(0, 80)}…`);

        const ltcTxid = await ltcRpc('sendrawtransaction', rawTx) as string;
        progress(`LTC tx broadcast! txid: ${ltcTxid}`);
        progress(`Change UTXO (for next test run): TEST_LTC_UTXO_TXID=${ltcTxid} TEST_LTC_UTXO_VOUT=1 TEST_LTC_UTXO_AMOUNT_SATS=${TEST_LTC_UTXO_AMOUNT_SATS - PAYMENT_SATS - FEE_SATS}`);

        // ── 6. Wait for florin-fe-be to index the LTC tx ──────────────────
        progress('\n=== STEP 6: Waiting for florin-fe-be to index LTC payment ===');
        progress(`Polling every ${POLL_MS / 1000}s until originTxhash appears…`);

        const withLtcTx = await pollUntil(
            'index LTC tx',
            () => getReservation(reservationId!),
            r => r !== null && typeof r.originTxhash === 'string',
            (r, attempt) => {
                if (!r) {
                    progress(`  [attempt ${attempt}] Reservation gone from API?`);
                } else if (r.originTxhash) {
                    progress(`  [attempt ${attempt}] LTC tx indexed! originTxhash=${r.originTxhash} originChain=${r.originChain}`);
                } else {
                    const ltcBlock = r.blockCount ?? '?';
                    progress(`  [attempt ${attempt}] LTC tx not yet indexed. Current LTC block: ${ltcBlock}. state=${r.state}`);
                }
            },
            PHASE_TIMEOUT,
        );

        progress(`\nReservation after LTC payment:`);
        console.log(JSON.stringify(withLtcTx, null, 2));

        expect(withLtcTx).not.toBeNull();
        expect(typeof (withLtcTx as Record<string, unknown>).originTxhash).toBe('string');

        // ── 7. Wait for florin-mm to settle ───────────────────────────────
        progress('\n=== STEP 7: Waiting for florin-mm to settle reservation ===');
        progress(`Polling every ${POLL_MS / 1000}s until state=SETTLED…`);
        progress(`(florin-mm must detect the LTC tx, call settlement, and florin-fe-be must index the event)`);

        const settled = await pollUntil(
            'settle reservation',
            () => getReservation(reservationId!),
            r => {
                const rec = r as Record<string, unknown>;
                return rec?.state === 'SETTLED' || rec?.state === '4' || rec?.state === 4;
            },
            (r, attempt) => {
                const rec = r as Record<string, unknown>;
                progress(`  [attempt ${attempt}] state=${rec?.state} targetTxhash=${rec?.targetTxhash ?? 'none'} targetBlockNumber=${rec?.targetBlockNumber ?? 'none'}`);
            },
            PHASE_TIMEOUT,
        );

        progress(`\nSettlement confirmed:`);
        console.log(JSON.stringify(settled, null, 2));

        // ── 8. Check history endpoint ──────────────────────────────────────
        progress('\n=== STEP 8: Verifying history endpoint ===');

        const history = await getHistory(evmWallet.address);
        progress(`GET /history/${evmWallet.address} → ${history.length} record(s)`);
        console.log(JSON.stringify(history, null, 2));

        const historyEntry = history.find(
            (h: unknown) => (h as Record<string, unknown>).reservationId === reservationId,
        );

        progress(`\nHistory entry for this reservation:`);
        console.log(JSON.stringify(historyEntry ?? '(not found)', null, 2));

        // ── 9. Final assertions ───────────────────────────────────────────
        progress('\n=== STEP 9: Assertions ===');

        const rec = settled as Record<string, unknown>;
        expect(rec.reservationId).toBe(reservationId);
        expect(rec.registrationChain).toBeDefined();
        expect(rec.originTxhash).toBeDefined();
        expect(historyEntry).toBeDefined();

        const SETTLED_STATE = ['SETTLED', '4', 4];
        expect(SETTLED_STATE).toContain(rec.state);

        progress('\n✓ All assertions passed. Full flow completed successfully!');
        progress(`  Reservation ID:   ${reservationId}`);
        progress(`  LTC tx:           ${(rec as Record<string, unknown>).originTxhash}`);
        progress(`  Settlement tx:    ${(rec as Record<string, unknown>).targetTxhash}`);

    }, TOTAL_TIMEOUT);

});
