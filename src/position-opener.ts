import axios from 'axios';
import { config } from "./common/config";

export async function openPosition(openPositionData: any): Promise<any> {
	const path = `${config.updateContractEndPoint}/open-position`;
	return await axios.post(path, { openPositionData });
}
