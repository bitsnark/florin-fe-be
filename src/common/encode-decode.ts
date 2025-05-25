import { bech32m, bech32 } from "bech32";
import { AddressType } from './types'


import { config, BtcAddressPrefixes } from './config';

export interface EncodedBtcAddress {
	EncodedBtcAddress: string;
	addressType: AddressType;
}


// p2pkh: 'm', p2pkh2: 'n', p2sh: '2', bech32: 'tb', bech32m: 'tb'
function getAddressType(address: string): AddressType {
	const { p2pkh, p2sh, bech32, bech32m } = BtcAddressPrefixes[config.btcAddressPrefixes as keyof typeof BtcAddressPrefixes];

	if (p2pkh.prefixes.some(prefix => address.startsWith(prefix))) return AddressType.P2PKH;
	if (p2sh.prefixes.some(prefix => address.startsWith(prefix))) return AddressType.P2SH;
	if (address.startsWith(bech32) && address.length === 42) return AddressType.P2WPKH;
	if (address.startsWith(bech32m) && address.length === 62) return AddressType.P2TR;

	throw new Error(`Unknown address type: ${address}`);
}

export function addressToBytes32(address: string): EncodedBtcAddress {
	const addressType = getAddressType(address);
	let program: Buffer;

	switch (addressType) {
		// case AddressType.P2PKH:
		// case AddressType.P2SH:
		// 	// Base58Check decode, remove version byte
		// 	const decoded = bs58check.decode(address);
		// 	program = Buffer.from(decoded.slice(1)); // Drop version
		// 	break;

		case AddressType.P2WPKH:
		case AddressType.P2WSH:
			const decodedBech32 = bech32.decode(address);
			program = Buffer.from(bech32.fromWords(decodedBech32.words.slice(1)));
			break;

		case AddressType.P2TR:
			const decodedBech32m = bech32m.decode(address);
			program = Buffer.from(bech32m.fromWords(decodedBech32m.words.slice(1)));
			break;

		default:
			throw new Error(`Unsupported address type: ${addressType}`);
	}

	if (program.length > 32) throw new Error('Program too long for bytes32');
	return {
		EncodedBtcAddress: '0x' + program.toString('hex').padStart(64, '0'),
		addressType
	};
}

export function decodeBytes32ToBitcoinAddress(
	bytes32Address: string,
	addressType: AddressType
): string {
	const { p2pkh, p2sh, bech32: bech32Prefix, bech32m: bech32mPrefix } =
		BtcAddressPrefixes[config.btcAddressPrefixes as keyof typeof BtcAddressPrefixes];

	// Remove '0x' and decode the hex into a buffer
	const hex = bytes32Address.startsWith('0x') ? bytes32Address.slice(2) : bytes32Address;
	const data: Uint8Array = Buffer.from(hex, 'hex');

	// Trim leading zeros (if padded to 32 bytes)
	const program = data.slice(data.findIndex((b) => b !== 0));

	switch (addressType) {
		// case AddressType.P2PKH: {
		// 	const full = Buffer.concat([Buffer.from([p2pkh.versionByte]), program]);
		// 	return bs58check.encode(full);
		// }

		// case AddressType.P2SH: {
		// 	const full = Buffer.concat([Buffer.from([p2sh.versionByte]), program]);
		// 	return bs58check.encode(full);
		// }

		case AddressType.P2WPKH:
		case AddressType.P2WSH: {
			const words = bech32.toWords(program);
			return bech32.encode(bech32Prefix, [0, ...words]); // version 0
		}

		case AddressType.P2TR: {
			const words = bech32m.toWords(program);
			return bech32m.encode(bech32mPrefix, [1, ...words]); // version 1
		}

		default:
			console.log(`Unsupported address type: ${addressType}`);
			return '';
	}
}


if (require.main === module) {
	// test
	// const bytes32Address = "0xaee285ec1e454ebeccac66bc61495c3f0ec0215726bf5cf10d99a15fa5b68dcb";
	// const p2trAddress2 = decodeBytes32ToBitcoinAddress(bytes32Address, AddressType.P2TR);
	// console.log(p2trAddress2);

	// const tpAddress = 'tb1p4m3gtmq7g48tan9vv67xzj2u8u8vqg2hy6l4eugdnxs4lfdk3h9sk4mp02';
	// const bytes32Address2 = addressToBytes32(tpAddress);
	// console.log(bytes32Address2);

	// const p2pwaddress = 'tb1qcdkgdddgn30rpvtt5flclt50xhr4j8nzd4jchk';
	// const encoded = addressToBytes32(p2pwaddress);
	// console.log(p2pwaddress, '>>', encoded.EncodedBtcAddress)
	// const addressFromBytes32 = decodeBytes32ToBitcoinAddress(encoded.EncodedBtcAddress, encoded.addressType);
	// console.log(`convert ${encoded.addressType}`, addressFromBytes32 === p2pwaddress)
}
