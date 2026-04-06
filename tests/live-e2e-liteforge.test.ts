/**
 * Live end-to-end test for the Liteforge L2 → LTC flow.
 *
 * Flow:
 *   1. Call LiteforgeSwap.swap(ltcAddress) on Liteforge L2 with native zkLTC
 *   2. florin-fe-be liteforge-scanner indexes the SwapInitiated event
 *   3. florin-mm detects the finalized swap and sends LTC to the receive address
 *
 * Prerequisites:
 *   1. TEST_L2_PRIVATE_KEY  — Liteforge L2 wallet funded with native zkLTC (18 decimals)
 *   2. TEST_LITEFORGE_LTC_RECEIVE_ADDRESS — LTC testnet address to receive payment (tltc1q...)
 *   3. LITEFORGE_SWAP_ADDRESS — deployed LiteforgeSwap contract address on L2
 *   4. FLORIN_API_URL — florin-fe-be API (default: http://35.239.92.14)
 *
 * Run with:
 *   npx jest tests/live-e2e-liteforge.test.ts --forceExit --verbose
 */

import dotenv from 'dotenv';
dotenv.config({ path: ['.env'] });

import { ethers } from 'ethers';
import { bech32, bech32m } from 'bech32';
import axios from 'axios';

// ─── Config ──────────────────────────────────────────────────────────────────

const L2_RPC_URL           = process.env.LITEFORGE_L2_RPC_URL    || 'https://liteforge.rpc.caldera.xyz/http';
const LITEFORGE_SWAP_ADDR  = process.env.LITEFORGE_SWAP_ADDRESS  || '';
const TATUM_URL            = process.env.BTC_NODE_HOST            || 'https://litecoin-testnet.gateway.tatum.io';
const TATUM_KEY            = process.env.BTC_NODE_PASSWORD;
const FLORIN_API           = process.env.FLORIN_API_URL           || 'http://35.239.92.14';

const TEST_L2_PRIVATE_KEY             = process.env.TEST_L2_PRIVATE_KEY;
const TEST_LITEFORGE_LTC_RECEIVE_ADDRESS = process.env.TEST_LITEFORGE_LTC_RECEIVE_ADDRESS;

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
 * Scan the UTXO set for an LTC address and return the total confirmed sats.
 * Uses scantxoutset which works without the address being in the node's wallet.
 */
async function getLtcAddressBalanceSats(address: string): Promise<number> {
    const result = await ltcRpc('scantxoutset', 'start', [`addr(${address})`]) as {
        total_amount: number;
        unspents: unknown[];
    };
    return Math.round((result.total_amount ?? 0) * 1e8);
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
        if (!TEST_L2_PRIVATE_KEY)
            throw new Error('Set TEST_L2_PRIVATE_KEY in .env (Liteforge L2 wallet with native zkLTC)');
        if (!TEST_LITEFORGE_LTC_RECEIVE_ADDRESS)
            throw new Error('Set TEST_LITEFORGE_LTC_RECEIVE_ADDRESS in .env (LTC testnet address)');
        if (!LITEFORGE_SWAP_ADDR)
            throw new Error('Set LITEFORGE_SWAP_ADDRESS in .env (deployed LiteforgeSwap contract)');

        // ── 1. Setup ───────────────────────────────────────────────────────
        progress('=== STEP 1: Setup ===');

        const l2Provider = new ethers.JsonRpcProvider(L2_RPC_URL);
        const l2Wallet   = new ethers.Wallet(TEST_L2_PRIVATE_KEY, l2Provider);

        const l2Balance  = await l2Provider.getBalance(l2Wallet.address);
        const ltcBlock   = await ltcRpc('getblockcount') as number;

        progress(`L2 RPC:            ${L2_RPC_URL}`);
        progress(`L2 wallet:         ${l2Wallet.address}`);
        progress(`L2 balance:        ${ethers.formatEther(l2Balance)} zkLTC`);
        progress(`LTC receive addr:  ${TEST_LITEFORGE_LTC_RECEIVE_ADDRESS}`);
        progress(`LTC tip:           block ${ltcBlock}`);
        progress(`Florin API:        ${FLORIN_API}`);
        progress(`LiteforgeSwap:     ${LITEFORGE_SWAP_ADDR}`);
        progress(`Swap amount:       ${SWAP_SATS} sats (${ethers.formatEther(SWAP_WEI)} zkLTC)`);

        if (l2Balance < SWAP_WEI) {
            throw new Error(
                `Insufficient L2 balance: have ${ethers.formatEther(l2Balance)} zkLTC, ` +
                `need at least ${ethers.formatEther(SWAP_WEI)} zkLTC (plus gas)`
            );
        }

        // Record LTC balance before the test so we can detect the incoming payment
        progress('\nRecording initial LTC balance at receive address…');
        const initialLtcSats = await getLtcAddressBalanceSats(TEST_LITEFORGE_LTC_RECEIVE_ADDRESS);
        progress(`Initial LTC balance: ${initialLtcSats} sats`);

        // ── 2. Encode LTC address as bytes32 ──────────────────────────────
        progress('\n=== STEP 2: Encode LTC receive address as bytes32 ===');

        const ltcAddressBytes32 = ltcAddressToBytes32(TEST_LITEFORGE_LTC_RECEIVE_ADDRESS);
        progress(`LTC address:  ${TEST_LITEFORGE_LTC_RECEIVE_ADDRESS}`);
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
        progress(`Polling LTC balance at ${TEST_LITEFORGE_LTC_RECEIVE_ADDRESS} every ${POLL_MS / 1000}s…`);
        progress(`(florin-mm sends LTC once the L2 swap block reaches finality)`);
        progress(`Initial balance: ${initialLtcSats} sats — waiting for it to increase…`);

        const finalLtcSats = await pollUntil(
            'LTC received',
            () => getLtcAddressBalanceSats(TEST_LITEFORGE_LTC_RECEIVE_ADDRESS),
            sats => sats > initialLtcSats,
            (sats, attempt) => {
                progress(`  [attempt ${attempt}] LTC balance: ${sats} sats (waiting for > ${initialLtcSats})`);
            },
            PHASE_TIMEOUT,
        );

        const receivedSats = finalLtcSats - initialLtcSats;
        progress(`\nLTC received! Balance increased by ${receivedSats} sats`);
        progress(`New total at receive address: ${finalLtcSats} sats`);

        // ── 6. Final assertions ───────────────────────────────────────────
        progress('\n=== STEP 6: Assertions ===');

        expect(indexedSwap).not.toBeNull();
        expect((indexedSwap as Record<string, unknown>).l2TxHash).toBeDefined();
        expect(finalLtcSats).toBeGreaterThan(initialLtcSats);
        expect(receivedSats).toBeGreaterThan(0);

        progress('\n✓ All assertions passed. Full Liteforge L2 → LTC flow completed!');
        progress(`  L2 tx hash:      ${l2TxHash}`);
        progress(`  L2 block:        ${swapReceipt.blockNumber}`);
        progress(`  messageNum:      ${messageNum}`);
        progress(`  LTC received:    ${receivedSats} sats at ${TEST_LITEFORGE_LTC_RECEIVE_ADDRESS}`);

    }, TOTAL_TIMEOUT);

});
