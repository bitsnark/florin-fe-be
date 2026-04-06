/**
 * Live end-to-end test for the Liteforge L2 → LTC flow.
 *
 * Flow:
 *   1. Call LiteforgeSwap.swap(ltcAddress) on Liteforge L2 with native zkLTC
 *   2. florin-fe-be liteforge-scanner indexes the SwapInitiated event
 *   3. florin-mm detects the finalized swap and sends LTC to the receive address
 *
 * Prerequisites:
 *   1. TEST_EVM_PRIVATE_KEY  — single keypair for Sepolia, Liteforge L2, and LTC receive address
 *   2. LITEFORGE_SWAP_ADDRESS — deployed LiteforgeSwap contract address on L2
 *   3. FLORIN_API_URL — florin-fe-be API (default: http://35.239.92.14)
 *
 * Run with:
 *   npx jest tests/live-e2e-liteforge.test.ts --forceExit --verbose
 */

import dotenv from 'dotenv';
dotenv.config({ path: ['.env'] });

import { ethers } from 'ethers';
import { bech32, bech32m } from 'bech32';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import ECPairFactory from 'ecpair';
import axios from 'axios';

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

// ─── Config ──────────────────────────────────────────────────────────────────

const L2_RPC_URL           = process.env.LITEFORGE_L2_RPC_URL    || 'https://liteforge.rpc.caldera.xyz/http';
const LITEFORGE_SWAP_ADDR  = process.env.LITEFORGE_SWAP_ADDRESS  || '';
const TATUM_URL            = process.env.BTC_NODE_HOST            || 'https://litecoin-testnet.gateway.tatum.io';
const TATUM_KEY            = process.env.BTC_NODE_PASSWORD;
const FLORIN_API           = process.env.FLORIN_API_URL           || 'http://35.239.92.14';

const TEST_EVM_PRIVATE_KEY = process.env.TEST_EVM_PRIVATE_KEY;

// LTC testnet network params
const LTC_TESTNET: bitcoin.networks.Network = {
    messagePrefix: '\x19Litecoin Signed Message:\n',
    bech32: 'tltc',
    bip32:  { public: 0x043587CF, private: 0x04358394 },
    pubKeyHash: 0x6f,
    scriptHash: 0x3a,
    wif: 0xef,
};

// Amount to swap: 20 000 sats worth = 20 000 × 10^10 = 2×10^14 wei (18-decimal zkLTC)
const SWAP_SATS   = 20_000n;
const SWAP_WEI    = SWAP_SATS * 10n ** 10n;

// Polling
const POLL_MS       = 30_000;
const PHASE_TIMEOUT = 60 * 60 * 1000;  // 60 min — L2 finality + florin-mm lag
const TOTAL_TIMEOUT = 120 * 60 * 1000; // 120 min total

// LiteforgeSwap ABI (only what the test needs)
const LITEFORGE_SWAP_ABI = [
    'function swap(bytes32 ltcAddress) external payable',
    'event SwapInitiated(address indexed user, bytes32 ltcAddress, uint256 amount, uint256 messageNum)',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ts(): string {
    return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function progress(msg: string) {
    console.log(`\n[${ts()}] ${msg}`);
}

async function sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}

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

async function ltcRpc(method: string, ...params: unknown[]): Promise<unknown> {
    for (let attempt = 0; attempt < 3; attempt++) {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (TATUM_KEY) headers['x-api-key'] = TATUM_KEY;
        const resp = await axios.post(
            TATUM_URL,
            { jsonrpc: '2.0', method, params, id: 1 },
            { headers, timeout: 30_000 },
        );
        const data = resp.data as { result: unknown; error?: { message: string } };
        if (data.error) {
            if (resp.status === 429) { await sleep(1000 * (attempt + 1)); continue; }
            throw new Error(`LTC RPC ${method}: ${data.error.message}`);
        }
        return data.result;
    }
    throw new Error(`LTC RPC ${method}: rate-limited after 3 attempts`);
}

/**
 * Derive the P2WPKH scriptPubKey hex for an LTC bech32 address.
 * Result looks like "0014<20-byte-pubkey-hash-hex>".
 */
function ltcAddressToScriptPubKeyHex(address: string): string {
    const decoded = bech32.decode(address);
    const program = Buffer.from(bech32.fromWords(decoded.words.slice(1)));
    return '0014' + program.toString('hex');
}

interface LtcPayment { txid: string; sats: number; confirmed: boolean; }

/**
 * Scan mempool + blocks since `sinceBlock` for any output paying to `address`.
 * Returns the first match found, or null if nothing found yet.
 */
async function findLtcPaymentToAddress(address: string, sinceBlock: number): Promise<LtcPayment | null> {
    const targetScript = ltcAddressToScriptPubKeyHex(address);

    // 1. Check mempool (catches unconfirmed payments quickly)
    try {
        const mempoolTxids = await ltcRpc('getrawmempool') as string[];
        for (const txid of mempoolTxids) {
            try {
                const tx = await ltcRpc('getrawtransaction', txid, true) as { vout: Array<{ value: number; scriptPubKey: { hex: string } }> };
                for (const vout of tx.vout ?? []) {
                    if (vout.scriptPubKey?.hex === targetScript) {
                        return { txid, sats: Math.round(vout.value * 1e8), confirmed: false };
                    }
                }
            } catch { continue; }
        }
    } catch { /* mempool RPC not available — fall through to block scan */ }

    // 2. Scan blocks from sinceBlock to current tip
    const currentHeight = await ltcRpc('getblockcount') as number;
    for (let h = sinceBlock; h <= currentHeight; h++) {
        const blockHash = await ltcRpc('getblockhash', h) as string;
        const block = await ltcRpc('getblock', blockHash, 2) as { tx: Array<{ txid: string; vout: Array<{ value: number; scriptPubKey: { hex: string } }> }> };
        for (const tx of block.tx ?? []) {
            for (const vout of tx.vout ?? []) {
                if (vout.scriptPubKey?.hex === targetScript) {
                    return { txid: tx.txid, sats: Math.round(vout.value * 1e8), confirmed: true };
                }
            }
        }
    }
    return null;
}

/**
 * Encode an LTC bech32/bech32m address to a bytes32 hex string (left-zero-padded).
 * Matches the addressToBytes32 convention in src/common/encode-decode.ts.
 */
function ltcAddressToBytes32(address: string): string {
    let program: Buffer;

    if (address.startsWith('tltc1q') || address.startsWith('ltc1q')) {
        // P2WPKH or P2WSH — bech32
        const decoded = bech32.decode(address);
        program = Buffer.from(bech32.fromWords(decoded.words.slice(1)));
    } else if (address.startsWith('tltc1p') || address.startsWith('ltc1p')) {
        // P2TR — bech32m
        const decoded = bech32m.decode(address);
        program = Buffer.from(bech32m.fromWords(decoded.words.slice(1)));
    } else {
        throw new Error(`Unsupported LTC address format: ${address}`);
    }

    if (program.length > 32) throw new Error('Address program too long for bytes32');
    return '0x' + program.toString('hex').padStart(64, '0');
}

async function getLiteforgeSwap(txHash: string): Promise<Record<string, unknown> | null> {
    try {
        const r = await axios.get(`${FLORIN_API}/liteforge-swap/${txHash}`, { timeout: 10_000 });
        return r.data as Record<string, unknown>;
    } catch (e: unknown) {
        if (axios.isAxiosError(e) && e.response?.status === 404) return null;
        throw e;
    }
}

// ─── Test ─────────────────────────────────────────────────────────────────────

describe('Live E2E: Liteforge L2 → LTC flow', () => {

    it('user swaps on L2, florin-mm sends LTC to receive address', async () => {

        // ── 0. Guard rails ─────────────────────────────────────────────────
        if (!TEST_EVM_PRIVATE_KEY)
            throw new Error('Set TEST_EVM_PRIVATE_KEY in .env (single keypair for L2, Sepolia, and LTC)');
        if (!LITEFORGE_SWAP_ADDR)
            throw new Error('Set LITEFORGE_SWAP_ADDRESS in .env (deployed LiteforgeSwap contract)');

        // ── 1. Setup ───────────────────────────────────────────────────────
        progress('=== STEP 1: Setup ===');

        const l2Provider = new ethers.JsonRpcProvider(L2_RPC_URL);
        const l2Wallet   = new ethers.Wallet(TEST_EVM_PRIVATE_KEY, l2Provider);

        // Derive LTC P2WPKH receive address from the same private key
        const privKeyHex     = TEST_EVM_PRIVATE_KEY.replace(/^0x/, '');
        const ltcKeyPair     = ECPair.fromPrivateKey(Buffer.from(privKeyHex, 'hex'), { network: LTC_TESTNET });
        const ltcP2wpkh      = bitcoin.payments.p2wpkh({ pubkey: Buffer.from(ltcKeyPair.publicKey), network: LTC_TESTNET });
        const ltcReceiveAddress = ltcP2wpkh.address!;

        const l2Balance      = await l2Provider.getBalance(l2Wallet.address);
        const ltcBlockBefore = await ltcRpc('getblockcount') as number;

        progress(`L2 RPC:            ${L2_RPC_URL}`);
        progress(`L2 wallet:         ${l2Wallet.address}`);
        progress(`L2 balance:        ${ethers.formatEther(l2Balance)} zkLTC`);
        progress(`LTC receive addr:  ${ltcReceiveAddress} (P2WPKH, derived from same key)`);
        progress(`LTC tip:           block ${ltcBlockBefore}`);
        progress(`Florin API:        ${FLORIN_API}`);
        progress(`LiteforgeSwap:     ${LITEFORGE_SWAP_ADDR}`);
        progress(`Swap amount:       ${SWAP_SATS} sats (${ethers.formatEther(SWAP_WEI)} zkLTC)`);

        if (l2Balance < SWAP_WEI) {
            throw new Error(
                `Insufficient L2 balance: have ${ethers.formatEther(l2Balance)} zkLTC, ` +
                `need at least ${ethers.formatEther(SWAP_WEI)} zkLTC (plus gas)`
            );
        }

        // ── 2. Encode LTC address as bytes32 ──────────────────────────────
        progress('\n=== STEP 2: Encode LTC receive address as bytes32 ===');

        const ltcAddressBytes32 = ltcAddressToBytes32(ltcReceiveAddress);
        progress(`LTC address:  ${ltcReceiveAddress}`);
        progress(`As bytes32:   ${ltcAddressBytes32}`);

        // ── 3. Call LiteforgeSwap.swap() on L2 ───────────────────────────
        progress('\n=== STEP 3: Calling LiteforgeSwap.swap() on L2 ===');

        const swapContract = new ethers.Contract(LITEFORGE_SWAP_ADDR, LITEFORGE_SWAP_ABI, l2Wallet);

        progress(`Calling swap(${ltcAddressBytes32}) with value=${SWAP_WEI} wei…`);

        const swapTx = await swapContract.swap(ltcAddressBytes32, { value: SWAP_WEI });
        progress(`Tx sent: ${swapTx.hash}`);
        progress('Waiting for L2 confirmation…');

        const swapReceipt = await swapTx.wait();
        progress(`Confirmed in L2 block ${swapReceipt.blockNumber} (gas used: ${swapReceipt.gasUsed})`);

        // Parse SwapInitiated event
        const iface = new ethers.Interface(LITEFORGE_SWAP_ABI);
        let messageNum: bigint | null = null;
        let emittedAmount: bigint | null = null;

        for (const log of swapReceipt.logs) {
            try {
                const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
                if (parsed?.name === 'SwapInitiated') {
                    emittedAmount = parsed.args.amount as bigint;
                    messageNum    = parsed.args.messageNum as bigint;
                    progress(`SwapInitiated event:`);
                    progress(`  user:       ${parsed.args.user}`);
                    progress(`  ltcAddress: ${parsed.args.ltcAddress}`);
                    progress(`  amount:     ${emittedAmount} wei (${Number(emittedAmount) / 1e10} sats)`);
                    progress(`  messageNum: ${messageNum}`);
                }
            } catch { /* skip non-matching logs */ }
        }

        if (messageNum === null) {
            throw new Error('SwapInitiated event not found in tx receipt — wrong contract or ABI?');
        }

        const l2TxHash = swapTx.hash as string;
        progress(`\nL2 tx hash: ${l2TxHash}`);

        // ── 4. Wait for florin-fe-be to index the swap ────────────────────
        progress('\n=== STEP 4: Waiting for florin-fe-be to index swap ===');
        progress(`Polling GET ${FLORIN_API}/liteforge-swap/${l2TxHash} every ${POLL_MS / 1000}s…`);

        const indexedSwap = await pollUntil(
            'index swap',
            () => getLiteforgeSwap(l2TxHash),
            swap => swap !== null,
            (swap, attempt) => {
                if (swap) {
                    progress(`  [attempt ${attempt}] Swap indexed! state=${swap.state} l2BlockNumber=${swap.l2BlockNumber}`);
                } else {
                    progress(`  [attempt ${attempt}] Not yet indexed (404)…`);
                }
            },
            PHASE_TIMEOUT,
        );

        progress(`\nSwap indexed by florin-fe-be:`);
        console.log(JSON.stringify(indexedSwap, null, 2));

        // ── 5. Wait for florin-mm to send LTC ────────────────────────────
        progress('\n=== STEP 5: Waiting for florin-mm to send LTC ===');
        progress(`Scanning mempool + blocks from ${ltcBlockBefore} for payment to ${ltcReceiveAddress}`);
        progress(`(florin-mm sends LTC once the L2 swap block reaches finality)`);

        const ltcPayment = await pollUntil(
            'LTC received',
            () => findLtcPaymentToAddress(ltcReceiveAddress, ltcBlockBefore),
            p => p !== null,
            (p, attempt) => {
                if (p) {
                    progress(`  [attempt ${attempt}] Payment found! txid=${p.txid} sats=${p.sats} confirmed=${p.confirmed}`);
                } else {
                    progress(`  [attempt ${attempt}] No payment yet — checking mempool + new blocks…`);
                }
            },
            PHASE_TIMEOUT,
        );

        progress(`\nLTC received! ${ltcPayment.sats} sats (confirmed=${ltcPayment.confirmed})`);

        // ── 6. Final assertions ───────────────────────────────────────────
        progress('\n=== STEP 6: Assertions ===');

        expect(indexedSwap).not.toBeNull();
        expect((indexedSwap as Record<string, unknown>).l2TxHash).toBeDefined();
        expect(ltcPayment).not.toBeNull();
        expect(ltcPayment.sats).toBeGreaterThan(0);

        progress('\n✓ All assertions passed. Full Liteforge L2 → LTC flow completed!');
        progress(`  L2 tx hash:      ${l2TxHash}`);
        progress(`  L2 block:        ${swapReceipt.blockNumber}`);
        progress(`  messageNum:      ${messageNum}`);
        progress(`  LTC received:    ${ltcPayment.sats} sats (txid=${ltcPayment.txid}) at ${ltcReceiveAddress}`);

    }, TOTAL_TIMEOUT);

});
