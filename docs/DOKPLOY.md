# Running Gantry on Dokploy

This guide puts Gantry on a Dokploy server behind `gantry.fast`, and sets it up so that a new version replaces the
old one without the site going down.

## What gets deployed

A single container, built from the [`Dockerfile`](../Dockerfile) at the repository root. Its entrypoint
([`deploy/start.mjs`](../deploy/start.mjs)) runs two processes and stops both if either one exits:

| Process | Listens on | Does |
|---|---|---|
| Next.js site | `PORT`, 7310 by default | Serves the pages and forwards every `/api/*` request to the backend, so the browser only ever talks to one origin. |
| Backend | port 42069, not routed from outside: the site reaches it on 127.0.0.1 | REST API, chain indexer, fee router, OTC, Fleet entries, Heat Shield payouts, and the simulated market in demo mode. |

State lives in two volumes:

| Volume | Mounted at | Contents | Lose it and |
|---|---|---|---|
| `gantry-data` | `/app/data` | The SQLite database (`demo.db`, `gantry-devnet.db` or `gantry-mainnet-beta.db`), demo wallet files, uploaded coin images | you lose the platform's books. Required. |
| `gantry-static` | `/app/web/.next/static` | Hashed scripts, styles and fonts of this build and of earlier ones | pages opened before an update can fail to load their scripts until reloaded. |

The wallet keys are not in the image or on a volume in a real deployment: they are environment variables read when
the backend starts.

## Why an Application and not a Compose service

Dokploy can run a repository two ways. A **Docker Compose** service is updated by stopping the old container and
then starting the new one, which leaves a gap. An **Application** is a Docker Swarm service, and Swarm can do it the
other way round: start the new container, wait until it is healthy, then stop the old one. Everything below depends
on that order, so create an Application.

## Set it up

### 1. Create the Application

In your Dokploy project choose **Create Service → Application** and call it `gantry`.

Under **General**:

- **Provider:** GitHub, repository `your-org/gantry`, branch `master`. A plain Git URL with a deploy key works too.
- **Build Type:** Dockerfile. **Dockerfile Path:** `Dockerfile`. **Docker Context Path:** `.`
- **Build-time Arguments** (optional): `DEPLOYMENT_ID=$COMMIT`, or anything else that changes with each deploy.
  Without it the image uses its build time. This id is what makes a browser on the previous version reload
  instead of mixing old and new code.

### 2. Environment

Paste [`deploy/dokploy.env.example`](../deploy/dokploy.env.example) into the **Environment** tab.

| Variable | For the first deploy | Notes |
|---|---|---|
| `DEMO` | `1` | Simulated market and a burner wallet; no keys or RPC needed. Empty switches to a real cluster. |
| `CLUSTER` | `mainnet-beta` | `devnet` or `mainnet-beta`. Ignored while `DEMO=1`. |
| `PORT` | `7310` | The site's port inside the container. Must match the domain's container port. |
| `PUBLIC_URL` | `https://gantry.fast` | The exact public origin, no trailing slash. Token metadata URIs are built from it. |
| `RPC_URL` | empty | The backend's RPC. Use a paid endpoint in real mode: holder reconciliation needs `getProgramAccounts`. |
| `PUBLIC_RPC_URL` | empty | The RPC browsers use to send transactions. Give it a key restricted to your domain. |
| `FEE_WALLET`, `OTC_WALLET`, `PROTECTION_WALLET` | empty | Secret keys, base58 or a JSON byte array in quotes. Leave empty in demo mode. |
| `LOOKUP_TABLE` | empty | The address lookup table launches use. Fill it in once the backend has created one (see below). |
| `MAIN_TOKEN_MINT` | empty | Mint of the platform token to feature. No fees go to it. |
| `JUPITER_API_KEY` | empty | Only for Jupiter's paid host. |
| `PINATA_JWT` | empty | Pin coin images and metadata to IPFS instead of keeping them on the data volume. |
| `FEE_MIN_USD`, `FEES_EVERY_MS`, `ENTRIES_EVERY_MS`, `PRIORITY_MICROLAMPORTS` | defaults | Fee-router tuning. |

Keys belong in **Environment** only. Never put them in **Build-time Arguments**: those end up in image layers.

### 3. Volumes

Under **Advanced → Volumes** add two **Volume Mounts**:

- `gantry-data` at `/app/data`
- `gantry-static` at `/app/web/.next/static`

On every start the container copies its own build's static files into the second volume, next to those of earlier
builds, and removes files that no build has shipped for 30 days.

### 4. Domain

Under **Domains** add `gantry.fast`, path `/`, container port **7310** (or whatever you set `PORT` to), HTTPS with
Let's Encrypt. Point the domain's DNS at the server first so the certificate can be issued.

To serve `www.gantry.fast` as well, add it the same way and create a "www to non-www" redirect under
**Advanced → Redirects**.

### 5. Start-first updates

Under **Advanced → Cluster Settings**:

- **Replicas:** `1`. Background work runs on exactly one server at a time. A second replica would only stand by, and
  would need the data volume shared across nodes.

- **Swarm Settings → Update Config**

  ```json
  { "Parallelism": 1, "Delay": 0, "FailureAction": "rollback", "Monitor": 60000000000, "MaxFailureRatio": 0, "Order": "start-first" }
  ```

- **Swarm Settings → Rollback Config**

  ```json
  { "Parallelism": 1, "Delay": 0, "FailureAction": "pause", "Monitor": 60000000000, "MaxFailureRatio": 0, "Order": "start-first" }
  ```

- **Health Check.** The image already carries this check. Set it here as well, so an update can never begin
  without one:

  ```json
  { "Test": ["CMD", "node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 7310) + '/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"], "Interval": 5000000000, "Timeout": 3000000000, "StartPeriod": 60000000000, "Retries": 3 }
  ```

- **Stop Grace Period**, if your Dokploy version exposes it: `15000000000`. The old container needs up to about ten
  seconds to hand over, and the entrypoint gives up after twelve.

These fields take durations in nanoseconds: `5000000000` is five seconds.

### 6. Deploy

Press **Deploy** and watch the build log. When it finishes, open `https://gantry.fast/api/health`. A healthy first
deploy answers:

```json
{ "ok": true, "state": "leader", "mode": "demo" }
```

Turn on **Autodeploy** if you want every push to `master` to go out the same way.

## What happens during an update

| Step | Old container | New container |
|---|---|---|
| Build | Serving. A failed build changes nothing. | Not started. |
| Start | Serving, and still holds the background-work lease. | Opens the same SQLite file and serves the site and the API at once. Its health check passes in the `standby` state. |
| Hand-over | Receives SIGTERM. Starts no new jobs, lets the running one finish (8 seconds at most), releases the lease, finishes open requests, exits. | Takes the lease within about 2 seconds and becomes `leader`. |
| If the old one crashes instead | Gone without releasing anything. | The lease expires after 15 seconds and the standby takes over anyway. |
| If the new one never gets healthy | Kept running. | Swarm rolls back after the one-minute monitor window. |

Pages that were open before the update keep working: their scripts are still on the static volume, and on the next
navigation they reload into the new version.

Money is safe across the hand-over because every step is recorded before it is carried out:

- The fee router books a batch as split before it moves anything, so a batch is never paid twice. Anything that did
  not get sent goes back in the queue.
- An OTC sale is one transaction signed by the seller and the reserve. Its quote is in the database, and the new
  server settles any sale that confirmed while the old one was shutting down.
- Heat Shield payouts and Fleet entry airdrops are marked as sending before the transfer. What was owed and not yet
  sent stays owed and goes out on a later pass. A batch that was cut off in the middle of a transfer stays marked as
  sending for you to check, rather than being sent a second time.

You can watch it happen. Leave this running while you press **Deploy**; it should print nothing but `200`:

```bash
while true; do curl -s -o /dev/null -w '%{http_code} %{time_total}s\n' https://gantry.fast/api/stats; sleep 0.5; done
```

In the logs, the new container prints `standby: another server holds the lease` followed by
`leader: took over background work`, and the old one prints `SIGTERM: handing over`.

## From demo to a real cluster

Do this on devnet first, then repeat it for mainnet with new wallets.

1. **Keys.** Generate three keypairs offline, for instance with `solana-keygen new`, and paste their secret keys
   into `FEE_WALLET`, `OTC_WALLET` and `PROTECTION_WALLET`. Fund the fee wallet with SOL: it pays the rent of the
   platform's Raydium accounts and all network fees, and the backend logs a warning below 0.05 SOL.
2. **Environment.** Set `DEMO=` (empty), `CLUSTER=devnet`, `RPC_URL` and `PUBLIC_RPC_URL`, then redeploy.
   `/api/health` now reports `"mode": "devnet"`.
3. **Platform config.** The fee wallet needs a Raydium LaunchLab platform config and an address lookup table. The
   first launch creates both on demand. To create them ahead of time, open the application's **Terminal** and run
   the setup script the same way the entrypoint runs the backend:

   ```sh
   cd /app/backend && node --import tsx src/scripts/platform.ts
   ```

   The script prints the lookup table's address; when a launch creates the table instead, the address is in the
   application log. Copy it into `LOOKUP_TABLE` so a new data volume would keep using the same table.
4. **Rehearse.** Launch a coin, trade it both ways, wait for a fee split, sell at a loss and watch the payout, sell
   into the OTC reserve, take a coin through graduation, and launch a look-alike to see its Fleet entry airdropped.
   Check the three wallets on Solscan against `/api/stats`. On devnet use the SOL pair: Jupiter does not route
   devnet tokens, so fees taken in devnet USDC cannot be converted.
5. **Mainnet.** Set `CLUSTER=mainnet-beta`, swap in fresh wallets and a mainnet RPC, clear `LOOKUP_TABLE` (tables
   are per cluster) and redeploy. Each cluster has its own database file, so devnet data is left untouched.

## Backups

Everything worth keeping is the SQLite file on `gantry-data`. From the application's **Terminal**:

```sh
node -e "const {DatabaseSync}=require('node:sqlite');new DatabaseSync('/app/data/gantry-mainnet-beta.db').exec(\"VACUUM INTO '/app/data/backup.db'\")"
```

That writes a consistent copy while the server keeps running. Move `backup.db` off the machine, or schedule a
volume backup in Dokploy.

Restore from a backup; do not start a live deployment on an empty database. The chain holds every trade, but the
database is the only record of which fees have already been split, which losses have been paid, which Fleet entries
are owed and which OTC quotes are open. An indexer starting from nothing would see old fees and old losses as new.

## Rules for seamless updates

- **Only add to the schema.** During a hand-over two versions use the same database, and after a rollback the old
  version runs against the new schema. Add tables and columns; do not rename or drop them in the same release.
- **Stay at one replica.**
- **Settings change on redeploy.** Environment variables are read at startup. A redeploy goes through the same
  hand-over, so it is safe at any time.
- **Keep the two volumes private to this application.**

## Try the image locally

```sh
docker build -t gantry .
docker volume create gantry-data
docker run --rm -p 7310:7310 -v gantry-data:/app/data -e DEMO=1 -e PUBLIC_URL=http://localhost:7310 gantry
```

Then open `http://localhost:7310`.

## Further reading

- [Dokploy: zero-downtime deployments](https://docs.dokploy.com/docs/core/applications/zero-downtime)
- [Dokploy: advanced application settings](https://docs.dokploy.com/docs/core/applications/advanced)
- [Next.js: self-hosting](https://nextjs.org/docs/app/guides/self-hosting)
