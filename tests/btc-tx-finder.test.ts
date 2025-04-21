import { BitcoinTxFinder } from "../src/btc/btc-tx-finder";
import { BitcoinNode } from "../src/btc/bitcoin-node";
import { MaterializedReservation } from "../src/db/materialized-reservation";
import { BtcTxDb } from "../src/db/btc-tx-db";
import { ReservationState } from "../src/common/types";
import { keccak256 } from "ethers";

jest.mock("../src/btc/bitcoin-node");
jest.mock("../src/db/materialized-reservation");
jest.mock("../src/db/btc-tx-db");

describe("BitcoinTxFinder.scanBlock", () => {
	let bitcoinTxFinder: BitcoinTxFinder;
	let mockBitcoinRPC: jest.Mocked<BitcoinNode>;
	let mockEventsDb: jest.Mocked<MaterializedReservation>;
	let mockBtcDB: jest.Mocked<BtcTxDb>;

	beforeEach(() => {
		bitcoinTxFinder = new BitcoinTxFinder();
		mockBitcoinRPC = bitcoinTxFinder.bitcoinRPC as jest.Mocked<BitcoinNode>;
		mockEventsDb = bitcoinTxFinder.eventsDb as jest.Mocked<MaterializedReservation>;
		mockBtcDB = bitcoinTxFinder.btcDB as jest.Mocked<BtcTxDb>;
	});

	it("should throw an error if no pending reservations are found", async () => {
		mockEventsDb.getReservationsByState.mockResolvedValue([]);

		await expect(bitcoinTxFinder.scanBlock(100, "blockHash")).rejects.toThrow(
			"No pending reservations found"
		);

		expect(mockEventsDb.getReservationsByState).toHaveBeenCalledWith(ReservationState.PENDING);
	});

	it("should skip transactions that do not match any pending reservations", async () => {
		mockEventsDb.getReservationsByState.mockResolvedValue([
			{ btcAddress: "address1", amount: BigInt(5000), partialSettlement: false, chainId: 1, reservationId: keccak256(Buffer.from("res1")) } as any,
		]);

		mockBitcoinRPC.getBlock.mockResolvedValue({
			tx: [
				{
					txid: "tx1",
					vout: [
						{ scriptPubKey: { address: "address2" }, value: 0.5 },
					],
				},
			],
		} as any);

		await bitcoinTxFinder.scanBlock(100, "blockHash");

		expect(mockBtcDB.insertTx).not.toHaveBeenCalled();
	});

	it("should insert a transaction with matching amount and address - partial position", async () => {
		mockEventsDb.getReservationsByState.mockResolvedValue([
			{ btcAddress: "address1", amount: BigInt(5000), partialSettlement: true, chainId: 1, reservationId: keccak256(Buffer.from("res1")) } as any,
		]);

		mockBitcoinRPC.getBlock.mockResolvedValue({
			tx: [
				{
					txid: "tx1",
					vout: [
						{ scriptPubKey: { address: "address1" }, value: 0.00005 },
					],
				},
			],
		} as any);

		await bitcoinTxFinder.scanBlock(100, "blockHash");

		expect(mockBtcDB.insertTx).toHaveBeenCalledWith({
			txid: "tx1",
			blockHash: "blockHash",
			blockHeight: 100,
			targetChainId: 1,
			reservationId: keccak256(Buffer.from("res1"))
		});
	});

	//Partial reservation - identify by address + ammount

	it("should not insert a transaction if amount or address not matching - partial position", async () => {
		mockEventsDb.getReservationsByState.mockResolvedValue([
			{ btcAddress: "address1", amount: BigInt(5000), partialSettlement: true, chainId: 1, reservationId: keccak256(Buffer.from("res1")) } as any,
		]);

		mockBitcoinRPC.getBlock.mockResolvedValue({
			tx: [
				{
					txid: "tx1",
					vout: [
						{ scriptPubKey: { address: "address1" }, value: 0.0005 },
					],
				},
				{
					txid: "tx2",
					vout: [
						{ scriptPubKey: { address: "address2" }, value: 0.00005 },
					],
				},
			],
		} as any);

		await bitcoinTxFinder.scanBlock(100, "blockHash");

		expect(mockBtcDB.insertTx).not.toHaveBeenCalled();
	});



	//------------------------------------------------------------------
	//Full reservation - identify by memo + address + amount
	//-------------------------------------------------------------------
	it("should insert a transaction if amount, address & memo are matching - FULL position", async () => {
		mockEventsDb.getReservationsByState.mockResolvedValue([
			{ btcAddress: "address1", amount: BigInt(5000), partialSettlement: false, chainId: 1, reservationId: keccak256(Buffer.from("res1")) } as any,
		]);

		mockBitcoinRPC.getBlock.mockResolvedValue({
			tx: [
				{
					txid: "tx1",
					vout: [
						{ scriptPubKey: { hex: '000093608083a4284281eb999511a3994df9b4c0320e55390e69bc7bfdd5a14d24d9' } },
						{ scriptPubKey: { address: "address1" }, value: 0.00005 },
					],
				}
			],
		} as any);

		await bitcoinTxFinder.scanBlock(100, "blockHash");

		expect(mockBtcDB.insertTx).toHaveBeenCalledWith({
			txid: "tx1",
			blockHash: "blockHash",
			blockHeight: 100,
			targetChainId: 1,
			reservationId: keccak256(Buffer.from("res1"))
		});
	});

	it("should not insert a transaction if memo,amount or address not matching - FULL position", async () => {
		mockEventsDb.getReservationsByState.mockResolvedValue([
			{ btcAddress: "address1", amount: BigInt(5000), partialSettlement: false, chainId: 1, reservationId: keccak256(Buffer.from("res1")) } as any,
		]);

		mockBitcoinRPC.getBlock.mockResolvedValue({
			tx: [
				{
					txid: "tx1", //different amount
					vout: [
						{ scriptPubKey: { hex: '000093608083a4284281eb999511a3994df9b4c0320e55390e69bc7bfdd5a14d24d9' } },
						{ scriptPubKey: { address: "address1" }, value: 0.0005 },
					],
				},
				{
					txid: "tx2", //different address
					vout: [
						{ scriptPubKey: { hex: '000093608083a4284281eb999511a3994df9b4c0320e55390e69bc7bfdd5a14d24d9' } },
						{ scriptPubKey: { address: "address2" }, value: 0.00005 },
					],
				},
				{
					txid: "tx3", //different memo
					vout: [
						{ scriptPubKey: { hex: '000093608083a4284281eb999511a3994df9b4c0320e55390e69bc7bfdd5a14d24d0' } },
						{ scriptPubKey: { address: "address1" }, value: 0.00005 },
					],
				},
				{
					txid: "tx4", //no memo
					vout: [
						{ scriptPubKey: { address: "address1" }, value: 0.00005 },
					],
				}


			],
		} as any);

		await bitcoinTxFinder.scanBlock(100, "blockHash");

		expect(mockBtcDB.insertTx).not.toHaveBeenCalled();
	});

	// 	id
	// '0x3db31ba8aa54c450ea1bd76b3a5c9498f16bccecfe6de83b50029bcccc35dd17'
	// memo
	// '0x93608083a4284281eb999511a3994df9b4c0320e55390e69bc7bfdd5a14d24d9'
});
