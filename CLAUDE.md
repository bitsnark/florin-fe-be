# Scope

**IMPORTANT**: You are only responsible for the `florin-fe-be` repository. You may **read** other repositories for reference (e.g. to look up config or shared conventions), but never **modify** files outside of `florin-fe-be`.

## GCP Instance

SSH access:

```sh
ssh -i ~/.ssh/google_compute_engine gadzooks@35.239.92.14
```

Then act as the correct user:

```sh
sudo -u gadiguy bash
```

App runs as `gadiguy`, project at `~/florin-fe-be/`, logs at `~/florin-fe-be/data/app.log`.

PM2 runs as `root`: `sudo PM2_HOME=/root/.pm2 pm2 <command>`
Services: `api`, `evm-scanner`, `btc-scanner`

## Deployment Rules

**ALWAYS follow these rules in order when deploying or changing server configuration:**

### 1. .env changes

- Modify the **local `.env` first**, then copy to the server via `scp`:

```sh
scp -i ~/.ssh/google_compute_engine .env gadzooks@35.239.92.14:/tmp/florin.env
ssh ... 'sudo cp /tmp/florin.env /home/gadiguy/florin-fe-be/.env && sudo chown gadiguy:gadiguy /home/gadiguy/florin-fe-be/.env'
```

### 2. Code changes

- Commit and push local changes to GitHub (branch `g-litvm`), then pull on the server:

```sh
ssh ... 'sudo -u gadiguy bash -c "cd ~/florin-fe-be && git pull"'
```

- **Never** copy files directly to the server — always go through git.

### 3. Restarting PM2 (no env var caching)

- PM2 caches env vars in its process database. `--update-env` alone does NOT reload from `.env` on disk.
- **Always** delete and re-register processes to pick up fresh env vars:

```sh
sudo PM2_HOME=/root/.pm2 pm2 stop all
# truncate DB if needed
sudo PM2_HOME=/root/.pm2 pm2 delete all
sudo PM2_HOME=/root/.pm2 bash -c "cd /home/gadiguy/florin-fe-be && source .env && pm2 start run-api.sh --name api && pm2 start run-evm-scanner.sh --name evm-scanner && pm2 start run-btc-scanner.sh --name btc-scanner && pm2 save"
```

- `source .env` before `pm2 start` ensures PM2 stores the current env values.

### 4. Reading logs

- The main app log (`data/app.log`) accumulates across deployments. Always filter by timestamp:

```sh
grep "2026-03-10T09:3" /home/gadiguy/florin-fe-be/data/app.log
```

- PM2 per-process logs reset on delete/re-register and are more reliable for current runs:

```sh
sudo tail -30 /root/.pm2/logs/evm-scanner-out.log
sudo tail -30 /root/.pm2/logs/btc-scanner-out.log
sudo tail -30 /root/.pm2/logs/api-out.log
```

- Never trust log lines from before the current deployment's timestamp.

## Running E2E Tests

**ALWAYS run e2e tests on the server, never locally.**

The tests require access to the florin API at `http://localhost`, the LTC node, and the Sepolia RPC — all of which are configured in the server's `.env`. Running locally will fail because `http://localhost` won't resolve to the server API.

To run a test on the server:

```sh
ssh -i ~/.ssh/google_compute_engine gadzooks@35.239.92.14 'sudo -u gadiguy bash -c "cd ~/florin-fe-be && npx jest tests/live-e2e.test.ts --forceExit --verbose" 2>&1'
```

Before running, ensure the server's `.env` has up-to-date `TEST_*` vars (sync via scp as per Deployment Rules §1).

## Deployment Checklist

Before completing any task, verify:

1. **Source files in sync**: local == server == GitHub (branch `g-litvm`)
   - Check: `git status` on both sides; both should be clean and on the same commit
   - Code changes: commit/push locally → `git pull` on server
2. **.env in sync**: local == server (`.env` is not committed to git)
   - Local is authoritative — always edit local first, then copy to server
3. **Services running**: all three PM2 services online with no errors in logs
   - Check: `sudo PM2_HOME=/root/.pm2 pm2 list`
   - After any change: delete + re-register (see Deployment Rules §3)
   - Verify with PM2 per-process logs (not app.log)
