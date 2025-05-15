export function jsonStringifyCustom<T>(obj: T): string {
    return JSON.stringify(obj, (key, value) => {
        if (typeof value === 'bigint') return `${value.toString(10)}`;
        if (value?.type == 'Buffer' && value.data) {
            return 'Buffer:' + Buffer.from(value.data).toString('hex');
        }
        return value;
    });
}
