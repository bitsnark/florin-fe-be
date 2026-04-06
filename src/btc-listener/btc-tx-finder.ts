import { BlockVerbosity, Vout } from "../common/bitcoin-core-types";
import { BitcoinNode } from "./bitcoin-node";
import { notFound } from "../common/types";
import { MaterializedReservation, OpenReservation } from "../db/materialized-reservation";
import { BtcTxDb } from "../db/btc-tx-db";
import { btcToSatoshi } from "../common/btc-utils";
import { config } from "../common/config";
import { logger } from "../common/logger";


export interface UnfulfilledReservation {
	reservationId: string,
	bitcoinAddress: string,
	amount: bigint,
	isInscription: boolean,
	txid: string,
	chainId: number,
	positionId: string
}

interface ReservationToSettle extends OpenReservation {
	voutIndex: number;
}

export interface PendingMaps {
	byInscription: Map<string, OpenReservation>;
	byAddress: Map<string, OpenReservation>;
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


	async getPendingReservations(): Promise<PendingMaps> {
		const pending = await this.eventsDb.getUnfulfilledReservations();

		const byInscription: Map<string, OpenReservation> = new Map();
		const byAddress: Map<string, OpenReservation> = new Map();

		for (const p of pending) {
			if (p.isInscription) byInscription.set(p.reservationId, p);
			else byAddress.set(p.bitcoinAddress, p);
			// consoleLogJ(`cache reservation: posId: ${val.positionId}  rsvId: ${rsvId} amount: ${val.tokenAmount} `, 'free', LogLevel.debug);
		}
		return { byInscription, byAddress }
	}

	async scanBlock(blockHeight: number, blockHash: string): Promise<void> {
		const reservations = await this.getPendingReservations();
		if (reservations.byInscription.size === 0 && reservations.byAddress.size === 0) return;
		logger.info(`BitcoinTxFinder scanBlock: ${blockHeight} byInscription:${reservations.byInscription.size} byAddress:${reservations.byAddress.size} `);

		const block = await this.bitcoinRPC.getBlock(blockHash, BlockVerbosity.jsonWithTxs);

		for (const tx of block.tx) {
			const res = this.findTxReservation(tx.vout, reservations)
			if (!res) continue;

			logger.info(`Found reservation payment transaction for reservationId: ${res.reservationId} txid: ${tx.txid} blockHeight${blockHeight}`);

			await this.btcDB.insertTx({
				txid: tx.txid,
				blockHash: blockHash,
				blockHeight: blockHeight,
				targetChainId: config.chainId,
				reservationId: res.reservationId,
				positionId: res.positionId,
				amount: btcToSatoshi(tx.vout[res.voutIndex].value),
			})


		}
	}

	findTxReservation(out: Vout[], reservations: PendingMaps): ReservationToSettle | undefined {
		// Identify transaction by inscription
		let inscription = '';
		const inscriptionIndex = out.findIndex(
			(v: any) => {
				inscription = '0x' + v.scriptPubKey?.hex?.slice(4);
				return reservations.byInscription.has(inscription)
			}
		);

		// Identify transaction by address (match on scriptPubKey.hex — nodes don't always return address field)
		const addressIndex = out.findIndex(v =>
			reservations.byAddress.has(v.scriptPubKey.hex));

		// if transaction is found by address - return it (address uniquely identifies reservation)
		if (addressIndex !== notFound)
			return {
				voutIndex: addressIndex,
				...reservations.byAddress.get(out[addressIndex].scriptPubKey.hex)
			}


		if (inscriptionIndex !== notFound) {
			//make sure inscription based transaction sends to the right address with the right amount
			const r = reservations.byInscription.get(inscription)
			const voutIndex = out.findIndex(v =>
				v.scriptPubKey.hex === r.bitcoinAddress);

			if (voutIndex !== notFound)
				return {
					voutIndex,
					...r
				}

		}
		return undefined
	}

}



if (require.main === module) {
	const blockHeight = Number(process.argv[2]);
	if (isNaN(blockHeight)) {
		console.log('Usage: npm run btc tx finder <blockHeight : number>');
		process.exit(1);
	}

	(async () => {
		const btf = new BitcoinTxFinder();
		const blockHash = await btf.bitcoinRPC.getBlockHash(blockHeight)
		btf.scanBlock(blockHeight, blockHash);
	})();
}
