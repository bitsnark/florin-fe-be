declare module "*/AMMExchange.json" {
	interface AMMExchangeJson {
		abi: any[]; // Define the type of `abi` based on your actual ABI structure
		bytecode?: string;
		deployedBytecode?: string;
		[key: string]: any; // Allow additional properties if needed
	}
	const value: AMMExchangeJson;
	export default value;
}
