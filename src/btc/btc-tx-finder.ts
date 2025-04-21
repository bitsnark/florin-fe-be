import { BlockVerbosity } from "../common/bitcoin-core-types";
import { BitcoinNode } from "./bitcoin-node";
import { AbiCoder, keccak256 } from "ethers";
import { ReservationState } from "../common/types";
import { MaterializedReservation } from "../db/materialized-reservation";
import { BtcTxDb } from "../db/btc-tx-db";
import { Reservation } from "../common/types";
import { convertBytes32ToP2TRAddress } from "../common/bech32";

const notFound = -1;


export function calculateReservationId(chainId: string, id: string): string {
	const coder = new AbiCoder();
	const encoded = coder.encode(["uint256", "uint256"], [chainId, id]);
	return keccak256(encoded);
}

export function btcToSatoshi(btcAmount: number): number {
	return Math.round(btcAmount * 100000000);
}

interface ReservationWithMemo extends Reservation {
	memo?: string;
}


export class BitcoinTxFinder {
	bitcoinRPC!: BitcoinNode;
	eventsDb: MaterializedReservation;
	btcDB: BtcTxDb;

	constructor() {
		this.eventsDb = new MaterializedReservation();
		this.bitcoinRPC = new BitcoinNode();
		this.btcDB = new BtcTxDb();
	}

	async getPendingReservations(): Promise<Map<string, ReservationWithMemo>> {
		const rows = await this.eventsDb.getReservationsByState(ReservationState.PENDING);
		const reservationMap = new Map<string, ReservationWithMemo>();
		for (const row of rows) {
			if (row.partialSettlement) {
				//@Make sure btcAdress isnt convertBytes32ToP2TRAddress?
				reservationMap.set(row.btcAddress, row);
			}
			else {
				const memo = calculateReservationId(row.chainId.toString(), row.reservationId);
				reservationMap.set(row.btcAddress, { ...row, memo });
			}
		}
		return reservationMap;
	}

	async scanBlock(blockHeight: number, blockHash: string): Promise<void> {
		const rsvRows = await this.getPendingReservations();
		if (rsvRows.size === 0) throw new Error('No pending reservations found');

		const block = await this.bitcoinRPC.getBlock(blockHash, BlockVerbosity.jsonWithTxs);

		for (const tx of block.tx) {
			let reservation: ReservationWithMemo;

			//find transaction send to one of the pending reservations btcAddress
			const vAddress = tx.vout.findIndex(
				(v: any) => {
					if (!v.scriptPubKey || !v.scriptPubKey.address) return false;
					const expectedAmount = rsvRows.get(v.scriptPubKey.address)?.amount;
					return rsvRows.has(v.scriptPubKey.address) &&
						btcToSatoshi(v.value) === Number(expectedAmount);
				}
			);
			if ((vAddress === notFound)) continue
			reservation = rsvRows.get(tx.vout[vAddress].scriptPubKey.address);

			//if found check the type of the connected position
			//a full position btc transaction can be identified by the memoKey
			//a partial position btc transaction can be identified just by the address and amount
			if (!reservation.partialSettlement) {
				const voutNonceIndex = tx.vout.findIndex(
					(v: any) => {
						if (!v.scriptPubKey || !v.scriptPubKey.hex) return false;
						return reservation.memo === '0x' + v.scriptPubKey.hex.slice(4)
					}
				);
				if ((voutNonceIndex === notFound)) continue
			}


			await this.btcDB.insertTx({
				txid: tx.txid,
				blockHash: blockHash,
				blockHeight: blockHeight,
				targetChainId: reservation.chainId,
				reservationId: reservation.reservationId,
			})


		}
	}

}

async function main(blockHeight: number = 0): Promise<void> {




}

if (require.main === module) {
	if (process.argv.length > 2) {
		if (isNaN(Number(process.argv[2]))) {
			console.log('Usage: npm run pegin-pusher <blockHeight : number>');
			process.exit(1);
		}
		main(Number(process.argv[2]));
	} else {
		main();
	}
}
