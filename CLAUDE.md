# GCP Instance

SSH access:
```
ssh -i ~/.ssh/google_compute_engine gadzooks@35.239.92.14
```
Then act as the correct user:
```
sudo -u gadiguy bash
```

App runs as `gadiguy`, project at `~/florin-fe-be/`, logs at `~/florin-fe-be/data/app.log`.

PM2 runs as `root`: `sudo PM2_HOME=/root/.pm2 pm2 <command>`
Services: `api`, `evm-scanner`, `btc-scanner`
Restart with env changes: `sudo PM2_HOME=/root/.pm2 pm2 restart all --update-env`

## Deployment Checklist

Before completing any task, verify:

1. **Source files in sync**: local == server == GitHub (branch `g-litvm`)
   - Check: `git status` on both sides; both should be clean and on the same commit
   - If server has changes not on local: copy from server, commit, push
2. **.env in sync**: local == server (`.env` is not committed to git)
   - If different, server is authoritative — copy server → local
3. **Services running**: all three PM2 services online with no errors in logs
   - Check: `sudo PM2_HOME=/root/.pm2 pm2 list`
   - After any code or .env change: `sudo PM2_HOME=/root/.pm2 pm2 restart all --update-env`
   - Verify logs: `tail -30 ~/florin-fe-be/data/app.log`
