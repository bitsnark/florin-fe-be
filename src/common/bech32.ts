import { bech32m } from "bech32";

// Converts a bytes32 hex string (with "0x" prefix) back to a P2TR address.
export function convertBytes32ToP2TRAddress(
	bytes32Address: string,
	prefix: string = "tb"
): string {
	// Remove the "0x" prefix if present.
	const hex = bytes32Address.startsWith("0x") ? bytes32Address.slice(2) : bytes32Address;

	// Convert the hex string into a Buffer (32 bytes expected).
	const witnessProgram = Buffer.from(hex, "hex");
	if (witnessProgram.length !== 32) {
		throw new Error(`Expected witness program to be 32 bytes, got ${witnessProgram.length} bytes`);
	}

	// Convert the 32-byte witness program into 5-bit words.
	const witnessWords = bech32m.toWords(witnessProgram);

	// For P2TR, the witness version is 1.
	const version = 1;
	// Prepend the witness version to the words.
	const combined = [version, ...witnessWords];

	// Encode the combined words using bech32m.
	return bech32m.encode(prefix, combined);
}


// Function to convert a P2TR address to a bytes32 hex string
export function convertP2TRAddressToBytes32(address: string): string {
	// Decode the bech32m address
	const decoded = bech32m.decode(address);

	// Remove the first word (the witness version)
	const witnessWords = decoded.words.slice(1);

	// Convert the 5-bit words into 8-bit bytes
	const witnessProgram = bech32m.fromWords(witnessWords);

	// Check that the witness program is exactly 32 bytes (for a P2TR address)
	if (witnessProgram.length !== 32) {
		throw new Error(`Invalid witness program length: expected 32, got ${witnessProgram.length}`);
	}

	// Convert to a hex string with a "0x" prefix
	return "0x" + Buffer.from(witnessProgram).toString("hex");
}


if (require.main === module) {
	// test
	const bytes32Address = "0xaee285ec1e454ebeccac66bc61495c3f0ec0215726bf5cf10d99a15fa5b68dcb";
	const p2trAddress = convertBytes32ToP2TRAddress(bytes32Address, "tb");
	console.log(p2trAddress);
}
