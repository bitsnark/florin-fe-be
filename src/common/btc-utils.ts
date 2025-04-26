
export function btcToSatoshi(btcAmount: number): number {
	return Math.floor(btcAmount * 100000000);
}
