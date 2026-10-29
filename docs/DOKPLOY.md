# Deploy Recur on Dokploy (zero-downtime updates)

Recur ships as one Docker image (the [`Dockerfile`](../Dockerfile) at the repo root). Inside it, two processes run
side by side:

- the **Next.js site**, on port 7310 (set `PORT` to change it);
- the **backend**: API, chain indexer, fee router (burns), airdrops, protection payouts and the demo market.

Next proxies `/api/*` to the backend, so everything is served on one domain. The backend keeps its state in SQLite
on a Docker volume.

| Dokploy service | What it is | Holds |
|---|---|---|
| **Application** `recur` | This repository, built from the `Dockerfile` and run as a Docker Swarm service. Traefik sends `recur.lol` to it on port 7310. | The bucket wallet keys, at runtime only |
| Volume `recur-data` → `/app/data` | SQLite database, demo wallets, uploaded coin images | Coins, trades, holders, ledger, OTC quotes, claims |
| Volume `recur-static` → `/app/web/.next/static` | Scripts and styles of current and earlier builds | Nothing sensitive |

## Why an Application, not Compose

A Dokploy **Docker Compose** service stops the old container before starting the new one, so the site goes down
for the restart.

A Dokploy **Application** runs as a Swarm service. Swarm can start the new version first and stop the old one only
once the new one is healthy. The settings below turn that on.

### What happens on an update

1. **Build.** Dokploy builds the new image while the old version keeps serving. If the build fails, nothing changes.
2. **Standby.** The new container starts and opens the same SQLite file, then serves the site and API right away.
   Background work (indexing, fee splits and burns, airdrops, protection payouts) runs on exactly one server, the
   holder of a lease in the database. The old one still holds it, so the new one waits as a **standby**. Its health
   check counts that as healthy.
3. **Hand-over.**
   - Swarm stops the old container.
   - The old backend stops starting new work and lets its running job finish (8 seconds at most, usually well
     under 1).
   - It releases the lease, and the standby takes it within 2 seconds.
   - Next finishes open requests.
   - If the old container ever dies without handing over, the lease lapses after 15 seconds and the standby takes
     over anyway.
4. **Open pages keep working.** Their scripts stay downloadable from the shared static volume, and on the next
   click they reload into the new version, because every build has its own deployment ID.
5. **Rollback.** If the new version doesn't become healthy within a minute, Swarm puts the previous one back.

Money stays safe across the hand-over:
- The fee router books a batch before moving it, so a split is never paid twice.
- OTC trades and protection claims are single transactions co-signed by the user. Their state lives in the
  database, and the new server settles anything still in flight.
- Airdrop allocations not yet sent stay owed and go out on the next pass.

## Set up

1. **Application.**
   - In your Dokploy project, choose **Create Service → Application** and name it `recur`.
   - In **General**, set the provider to GitHub (`haiderlikesrust/rec`, branch `master`). A Git URL with a deploy key
     also works.
   - Set **Build Type** to **Dockerfile**, **Dockerfile Path** to `Dockerfile` and **Docker Context Path** to `.`.
   - Optional: under **Build-time Arguments**, add `DEPLOYMENT_ID=$COMMIT` (or any value that changes per deploy).
     The build time is used otherwise.
2. **Environment.**
   - Paste [`deploy/dokploy.env.example`](../deploy/dokploy.env.example) and set `PUBLIC_URL`.
   - For the first deploy keep `DEMO=1`. That gives a public demo with a simulated market and a burner wallet.
   - Wallet keys are runtime variables, read when the server starts. Never put them in **Build-time Arguments**.
3. **Volumes.** In **Advanced → Volumes**, add two **Volume Mounts**:
   - `recur-data` at `/app/data`. **Required.** Without it, every update starts from an empty database (and, in demo
     mode, new demo wallets).
   - `recur-static` at `/app/web/.next/static`. Each new container adds its build's files there, next to earlier
     builds'. Files no build has used for 30 days are removed.
4. **Domain.**
   - In **Domains**, add `recur.lol` with path `/`, container port **7310** (or your `PORT`), and HTTPS with Let's Encrypt. Point the
     domain's DNS at the server.
   - For `www.recur.lol`, add it the same way, then add a "www to non-www" redirect under **Advanced → Redirects**.
5. **Zero-downtime settings.** In **Advanced → Cluster Settings**:
   - **Replicas:** `1`. Background work only ever runs on one server; extra replicas would only sit on standby, and
     they'd need a shared volume across nodes.
   - **Swarm Settings → Update Config:**
     ```json
     { "Parallelism": 1, "Delay": 0, "FailureAction": "rollback", "Monitor": 60000000000, "MaxFailureRatio": 0, "Order": "start-first" }
     ```
   - **Swarm Settings → Rollback Config:**
     ```json
     { "Parallelism": 1, "Delay": 0, "FailureAction": "pause", "Monitor": 60000000000, "MaxFailureRatio": 0, "Order": "start-first" }
     ```
   - **Health Check:** the same check that is built into the image. Paste it anyway, so an update never starts
     without one:
     ```json
     { "Test": ["CMD", "node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 7310) + '/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"], "Interval": 5000000000, "Timeout": 3000000000, "StartPeriod": 60000000000, "Retries": 3 }
     ```
   - **Stop Grace Period** (if your Dokploy version shows it): `15000000000` (15 s). The hand-over needs up to ~10 s.
   - Durations in these fields are in nanoseconds (5000000000 = 5 s).
6. **Deploy.** Click **Deploy** and follow the build log. Then open `https://recur.lol/api/health`. It should show
   `"ok": true`, `"state": "leader"` and `"mode": "demo"`.
7. **Optional:** turn on **Autodeploy** so every push to `master` deploys the same way.

## Check an update yourself

Leave this running while you click **Deploy**. It should print only `200`s:

```bash
while true; do curl -s -o /dev/null -w '%{http_code} %{time_total}s\n' https://recur.lol/api/stats; sleep 0.5; done
```

The new container's log shows `standby: another server holds the lease`, then `leader: took over background work`.
The old one logs `SIGTERM: handing over`.

## Go live on Solana

1. Set `DEMO=` (empty), `CLUSTER=devnet` first, `RPC_URL` and `PUBLIC_RPC_URL`.
2. Generate the four wallets offline, for example with `solana-keygen new`. Paste their secret keys as `FEE_WALLET`,
   `OTC_WALLET`, `PROTECTION_WALLET` and `AIRDROP_WALLET`, then fund the fee wallet with ~0.5 SOL. Redeploy.
3. Do a full cycle on devnet: launch, trade, wait for a split and burn, sell at a loss, OTC sell, claim. Compare the
   wallets on Solscan with `/api/stats`.
4. Switch `CLUSTER=mainnet-beta` with fresh wallets and redeploy.
5. Launch $RECR through the app on the SOL pair, set `MAIN_TOKEN_MINT`, and redeploy.

## Back up the database

SQLite lives on the `recur-data` volume. From the application's **Terminal** in Dokploy:

```sh
node -e "const {DatabaseSync}=require('node:sqlite');new DatabaseSync('/app/data/mainnet-beta.db').exec(\"VACUUM INTO '/app/data/backup.db'\")"
```

Copy `backup.db` off the server (or schedule a volume backup in Dokploy). In real mode, the chain is the source of
truth for trades. A lost database can be re-indexed from the configs' signatures, but the owed airdrops and open
claims live only here.

## Rules that keep updates seamless

- **Schema changes must be additive.** Add tables and columns, and don't rename or drop them in the same release.
  During a hand-over, and after a rollback, the other version runs against the new schema.
- **Keep one replica.**
- **Changing settings needs a redeploy.** Settings are read when the server starts, and the redeploy goes through
  the same hand-over.
- **Never point another app at `recur-data` or `recur-static`.**

## Local check of the image

With Docker running:

```sh
docker build -t recur .
docker volume create recur-data
docker run --rm -p 7310:7310 -v recur-data:/app/data -e DEMO=1 -e PUBLIC_URL=http://localhost:7310 recur
```

Reference: [Dokploy zero downtime](https://docs.dokploy.com/docs/core/applications/zero-downtime),
[Dokploy advanced settings](https://docs.dokploy.com/docs/core/applications/advanced),
[Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting).
