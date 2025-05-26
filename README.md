# florin-fe-be
a backend api for supporting Florin UI,
mainly collecting and constructing historical records.

This repo assumes the deployment of the florin contracts - and its evm listener tracks AMMExchange contracts events (for more info https://github.com/bitsnark/florin/tree/main/packages/contracts)

Evm block scanner collects meaningful events from the AMMExchange contract,
Btc block scanner retrieve associated, mined, bitcoin transactions.

## Development

```npm i```
to install all dependencies

npm run postgres will generate a docker container with a florin-be-fe postgres db
hardhat node defined as default (check default values in config)

## Enviroment Variables
Most important are the env variables which defined your evm node, btc node, and postgres connection.
Here are the variable list with some default, test, values

### Postgres Configuration
POSTGRES_USER=postgres
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=florin_fe_be
POSTGRES_PASSWORD=1234
POSTGRES_KEEP_ALIVE=false

### Evm Configuration
PROVIDER_URL=http://localhost:8545
BLOCK_START=0 // Use the contract deploy evm block number in production
CHAIN_ID=31337
CONTRACT_ADDRESS=0x0165878A594ca255338adfa4d48449f69242Eb8F <-- Fixed hardhat address (AMMExchange)
MM_POSITION_ID=0x661b62831efbed6b8c6dd86ea7ed5ae2ecd4cc21c8dbccfafd4790f63e2647c1 <-- for development and testing, the AMMExchange is deployed with a predefined MM position - this is its static address
FINALITY_BLOCKS= // the amount of evm blocks to block finality assumption
LOOP_INTERVAL_MS=10000 // sleep between evm listener cycles

### Bitcoin Configuration
BTC_CHAIN_ID=-1 //-1 testnet4. use negative to prevent evm/btc ids collision
BTC_BLOCK_START=82656//Excluded from btc block scanner. No point of setting earlier then oracle initial block.
BTC_FINALITY_BLOCKS=3//6 in production
BTC_NODE_USERNAME=
BTC_NODE_PASSWORD=
BTC_NODE_HOST=http://xx.xx.xx.xx:port

BTC_ADDRESS_PREFIXES=//valid values are TESTNET or MAINNET. Required for bitcoin address encode/decode
EVM_TIMESTAMP_SAFETY_MARGIN_SEC=//The amount of sec to buffer in order to sync evm & btc block timestamps
THROTTLE_INTERVAL= im MS
RETRIES_ON_FAIL=default 2
###
# HTTP/HTTPS Configuration
HTTP_PORT=8080

## Run
To transpile typescript:
```
npm run build
```

To run server and btc/evm block scanners and process blocks
```
npm run start
```


to run only server without block scanners
```
npm run start:server
```

to drop and create a postgres docker container
```
npm run postgres
```

### API
The server supports the following calls:

get /history/address (user evm address)
get /reservation/reservationId
get /position/positionsId
get /btcBlockCount (the block height of the bitcoin blockchain)

## Contracts redeploy
When redeploying contracts, yet staying on the same chain:
change evm BLOCK_START= (if not hardhat)
change btc BTC_BLOCK_START=
change CONTRACT_ADDRESS=

wipe DB data (could leave blocks)

## logs

in ./data/app.log


