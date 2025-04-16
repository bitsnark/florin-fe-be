
const primes = [
    2, 3, 5, 7, 11, 13, 17, 19, 23, 29,
    31, 37, 41, 43, 47, 53, 59, 61, 67, 71,
    73, 79, 83, 89, 97, 101, 103, 107, 109, 113,
    127, 131, 137, 139, 149, 151, 157, 163, 167, 173,
    179, 181, 191, 193
];

const data = 21;
const nibble = 4;
const nibbleMax = (2 ** nibble) - 1;
const script = 25 + 2 * (2 ** nibble);
let total = 0;
let checksum = 0;
let totalNibbles = 0;

for (let k = 0; k < 8; k++) {
    for (let i = 0; i < primes.length; i++) {
        const nibbles = Math.ceil(Math.ceil(Math.log2(primes[i])) / nibble);
        totalNibbles += nibbles;
        total += nibbles * (data + script);
        checksum += nibbles * nibbleMax;
    }
}

const cs_nibbles = Math.ceil(Math.ceil(Math.log2(checksum)) / nibble);
totalNibbles += cs_nibbles;
total += cs_nibbles * (data + script);

console.log(`Total: ${total}`);
console.log(`totalNibbles: ${totalNibbles}`);
