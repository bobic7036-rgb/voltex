# VOLTEX CASE — Cloudflare Workers + D1

Telegram Mini App starter, adapted for Cloudflare Workers and D1.

## Features
- Telegram WebApp `initData` HMAC validation on every API request.
- New players start with **0 coins and an empty inventory**.
- D1 stores users, cases, rewards, inventory, admin actions and logs.
- Virtual-only case opening, published odds and item-to-virtual-coin exchange.
- TON Connect only links/displays a wallet address. No seed phrases, signatures, payments, transfers or cash-out.
- Admin-only overview, player balance adjustment, ban/unban, case setup, reward/weight setup and event logs.
- Admin access is controlled by `ADMIN_IDS`.

## 1. Create Cloudflare D1
In Cloudflare Dashboard: Storage & databases → D1 SQL Database → Create database → `voltex-db`.
Copy the database ID into `wrangler.jsonc`, replacing `PASTE_D1_DATABASE_ID_HERE`.

Or use Wrangler:
```bash
npx wrangler d1 create voltex-db
```

## 2. Set Telegram secrets
Create `.dev.vars` locally (do not commit it):
```env
BOT_TOKEN=your_botfather_token
ADMIN_IDS=your_numeric_telegram_id
```
For production:
```bash
npx wrangler secret put BOT_TOKEN
npx wrangler secret put ADMIN_IDS
```
`ADMIN_IDS` is a comma-separated list of numeric Telegram user IDs. Never put the bot token in frontend code or GitHub.

## 3. Install, migrate and run
```bash
npm install
npm run db:local
npm run dev
```
For the production database:
```bash
npm run db:remote
```

## 4. Deploy
```bash
npm run deploy
```
Connect this GitHub repository to Cloudflare Workers Builds if you want automatic deployments. Build command: `npm run build`; deploy command: `npx wrangler deploy`. Keep `wrangler.jsonc` committed, but never commit `.dev.vars`.

## 5. Telegram Mini App
In BotFather, configure the bot's Mini App/menu button URL to the deployed HTTPS Worker domain. Open the app from Telegram; direct browser calls to protected APIs are intentionally rejected because they lack signed Telegram initData.

## 6. TON Connect
Update `public/tonconnect-manifest.json` with the actual HTTPS domain and a publicly reachable icon URL. Wallet connection is optional and only stores the public address.

## Admin panel
Only IDs in `ADMIN_IDS` see the Admin tab. Features:
- Adjust a player's virtual coin balance (+/-).
- Ban or unban players.
- Create/update cases and their virtual coin prices.
- Create/update rewards and relative drop weights.
- Inspect recent logs and player list.

To add a reward, first create its case, then use that exact case ID in the reward form. Weight is relative: chance = reward weight / sum of weights for the case.

## Important
This is a virtual entertainment prototype. Coins and items have no cash value and cannot be withdrawn, transferred, sold for money or exchanged for TON. Do not add paid randomized mechanics or cash-out without professional legal/compliance review, age controls and appropriate consumer protections.

Before a public launch, add automated tests, abuse monitoring, stricter origin/rate controls, backups, and review D1 consistency/transaction handling. The current admin UI is intentionally simple and should be expanded with confirmation dialogs and pagination before high-volume use.
