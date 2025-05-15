
export function btcToSatoshi(btcAmount: number): bigint {
	return BigInt(Math.floor(btcAmount * 100000000));
}
