
export function btcToSatoshi(btcAmount: number): number {
	return Math.round(btcAmount * 100000000);
}
