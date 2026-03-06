import { config } from '../common/config';
import { Reservation, ReservationState } from '../common/types';
import { HistoryRecord, mapRowsToHistoryRecords, MaterializedHistory } from './materialized-history';

function rowToReservation(row: any): Reservation {
    return {
        positionId: row.position_id,
        state: row.state,
        ownerAddress: row.owner_address,
        blockNumber: row.block_number,
        blockHash: row.block_hash,
        reservationId: row.reservation_id,
        amount: row.amount,
        finality: row.finality,
        txhash: row.txhash,
        btcAddress: row.bitcoin_address, // format?
        isInscription: row.is_inscription,
        chainId: row.chain_id,
    };
}

export interface OpenReservation {
    reservationId: string,
    bitcoinAddress: string,
    amount: bigint,
    isInscription: boolean,
    txid: string,
    positionId: string
}


export class MaterializedReservation extends MaterializedHistory {

    constructor() {
        super();
    }

    async getReservationRecord(reservationId: string, finalityFlag: boolean): Promise<HistoryRecord> {
        let reservation = await this.getReservationById(reservationId, finalityFlag);
        if (!reservation) return undefined;

        const payment = await this.getOwnerBtcTransactions([reservation], finalityFlag);
        if (payment.length === 1) {
            reservation = {
                ...reservation,
                ...payment[0]
            }
        }

        const rs = await this.getReservationLastStatus([reservation], finalityFlag);
        if (rs.length === 1) {
            reservation = {
                ...reservation,
                ...rs[0]
            }
        }

        return reservation
    }

    protected async getReservationById(reservationId: string, finalityFlag?: boolean): Promise<HistoryRecord> {
        const query = `
            SELECT
                reservation_id, amount, bitcoin_address, owner_address,
                b.chain_id as registration_chain, rc.txhash as registration_txhash,
                b.block_number as registration_block_number, rc.block_hash as registration_block_hash,
                finality, b.block_timestamp
            FROM
                reservation_created_events as rc, blocks as b
            WHERE rc.block_hash = b.block_hash
                AND reservation_id= $1
                AND is_inscription = false
                AND ${finalityFlag ? "b.finality = 'FINAL'" : "b.finality <> 'REVERTED'"}
                `
        const result = await this.query(query, [reservationId]);
        if (result.rows.length < 1) return;
        return mapRowsToHistoryRecords(result.rows)[0];

    }

    // Returns the expected scriptPubKey hex for a reservation's bytes32-encoded address.
    // Used for matching against vout.scriptPubKey.hex in block data (nodes don't always return address fields).
    private bytes32ToScriptPubKeyHex(bytes32: string, isInscription: boolean): string {
        const hex = bytes32.startsWith('0x') ? bytes32.slice(2) : bytes32;
        if (isInscription) return '0014' + hex.slice(24); // P2WPKH: 0014 + 20 bytes
        return '5120' + hex;                              // P2TR:   5120 + 32 bytes
    }

    async getUnfulfilledReservations(): Promise<OpenReservation[]> {
        const query = `
        SELECT DISTINCT ON (rce.reservation_id)
            rce.reservation_id,
			rce.bitcoin_address,
			rce.amount,
			rce.is_inscription,
            rce.position_id,
			btc.txid
        FROM reservation_created_events rce
		inner join blocks br
		ON rce.block_hash = br.block_hash
		left outer join
		(select bb.finality btc_finality,
            bb.block_number,
            bb.chain_id,
		txid,
		reservation_id
		from bitcoin_txs bt  , blocks bb
        where bt.block_hash = bb.block_hash) as btc
		ON rce.reservation_id = btc.reservation_id
        WHERE br.chain_id =$1
        AND btc_finality <> 'REVERTED' OR btc_finality IS NULL
	    AND br.finality <> 'REVERTED'
        ORDER BY rce.reservation_id DESC;`
        const result = await this.query(query, [config.chainId]);
        return result.rows.map(row => ({
            reservationId: row.reservation_id,
            bitcoinAddress: this.bytes32ToScriptPubKeyHex(row.bitcoin_address, row.is_inscription),
            amount: row.amount,
            isInscription: row.is_inscription,
            txid: row.txid,
            positionId: row.position_id
        }));
    }

    async getAllReservations(finalityFlag?: boolean): Promise<Reservation[]> {
        const query = `
        SELECT DISTINCT ON (rce.reservation_id)
            rce.*,
            rse.state,
            rse.event_id,
            b.finality,
            b.block_number,
            b.chain_id
        FROM reservation_created_events rce, reservation_state_events rse, blocks b
        WHERE
        rce.reservation_id = rse.reservation_id
        AND rse.block_hash = b.block_hash
        AND ${finalityFlag ? "b.finality = 'FINAL'" : "b.finality <> 'REVERTED'"}
        ORDER BY rce.reservation_id, rse.event_id DESC;
        `;
        const result = await this.query(query, []);
        return result.rows.map(rowToReservation);
    }

    async getReservationsByState(reservationState: ReservationState, finalityFlag?: boolean): Promise<Reservation[]> {
        return (await this.getAllReservations(finalityFlag)).filter(r => r.state == reservationState);
    }
}
