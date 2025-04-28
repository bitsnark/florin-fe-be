import { BlockVerbosity } from "../common/bitcoin-core-types";
import { BitcoinNode } from "./bitcoin-node";
import { AbiCoder, keccak256 } from "ethers";
import { ReservationState } from "../common/types";
import { MaterializedReservation } from "../db/materialized-reservation";
import { BtcTxDb } from "../db/btc-tx-db";
import { Reservation } from "../common/types";
import { convertBytes32ToP2TRAddress } from "../common/bech32";
import { btcToSatoshi } from "../common/btc-utils";


export function calculateInscription(chainId: string, id: string): string {
	const coder = new AbiCoder();
	const encoded = coder.encode(["uint256", "uint256"], [chainId, id]);
	return keccak256(encoded);
}

interface ReservationWithInscription extends Reservation {
	inscription?: string;
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

	async getPendingReservationAddressMap(): Promise<Map<string, ReservationWithInscription>> {
		const rows = await this.eventsDb.getReservationsByState(ReservationState.PENDING);
		const reservationMap = new Map<string, ReservationWithInscription>();
		for (const row of rows) {
			if (row.isInscription) {
				const inscription = calculateInscription(row.chainId.toString(), row.reservationId);
				reservationMap.set(row.btcAddress, { ...row, inscription });
			}
			else {
				//@Make sure btcAdress isnt convertBytes32ToP2TRAddress?
				reservationMap.set(row.btcAddress, row);
			}
		}
		return reservationMap;
	}

	async scanBlock(blockHeight: number, blockHash: string): Promise<void> {
		const rsvRows = await this.getPendingReservationAddressMap();
		if (rsvRows.size === 0) throw new Error('No pending reservations found');

		const block = await this.bitcoinRPC.getBlock(blockHash, BlockVerbosity.jsonWithTxs);

		for (const tx of block.tx) {
			let reservation: ReservationWithInscription;

			// Find transactions sent to one of the pending reservations
			const outAddress = tx.vout.find(
				(v: any) => {
					if (!v.scriptPubKey || !v.scriptPubKey.address) return false;
					const expectedAmount = rsvRows.get(v.scriptPubKey.address)?.amount;
					return rsvRows.has(v.scriptPubKey.address) &&
						btcToSatoshi(v.value) === Number(expectedAmount);
				}
			);
			if (!outAddress) continue
			reservation = rsvRows.get(outAddress.scriptPubKey.address);

			// If found check the type of the connected position's partial/full flag
			// A partial position btc transaction is identified by the address and amount
			// A full position btc transaction is identified by the op_return data as well
			if (reservation.isInscription) {
				const outInscription = tx.vout.find(
					(v: any) => {
						if (!v.scriptPubKey || !v.scriptPubKey.hex) return false;
						return reservation.inscription === '0x' + v.scriptPubKey.hex.slice(4)
					}
				);
				if (!outInscription) continue
			}


			await this.btcDB.insertTx({
				txid: tx.txid,
				blockHash: blockHash,
				blockHeight: blockHeight,
				targetChainId: reservation.chainId,
				reservationId: reservation.reservationId,
				positionId: reservation.positionId
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
