import { config } from "./config";
import { logger } from "./logger";

let lastRequestTime = 0;

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function canProceed(): Promise<boolean> {
	const currentTime = Date.now();
	const timeSinceLastRequest = currentTime - lastRequestTime;
	if (timeSinceLastRequest < config.throttleInterval) {
		await delay(config.throttleInterval - timeSinceLastRequest);
	}
	lastRequestTime = Date.now();
	return true;
}

export async function throttle<T, Args extends unknown[]>(
	fn: (...args: Args) => Promise<T>, ...args: Args): Promise<T> {
	await canProceed();
	return await fn(...args);
}


export async function throttleWithRetries<T, Args extends unknown[]>(
	fn: (...args: Args) => Promise<T>, ...args: Args): Promise<T> {
	await canProceed();

	for (let attempt = 0; attempt <= config.retriesOnFail; attempt++) {
		try {
			return await fn(...args);
		} catch (e) {
			logger.error(`Throttle attempt ${attempt + 1} failed:`, e);
			if (attempt === config.retriesOnFail) throw e;
			await delay(config.throttleInterval);
		}
	}

	// This line should never be reached because the loop either returns or throws
	logger.error('Unexpected error in throttleWithRetries function');
	throw new Error('Unexpected error in throttle function');
}
