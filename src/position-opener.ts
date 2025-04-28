import axios from 'axios';
import { config } from "./common/config";

export async function openPosition(data: any): Promise<any> {
	const path = `${config.openPositionInListenerUrl}`;
	return await axios.post(path, { data });
}
