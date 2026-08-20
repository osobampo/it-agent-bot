# IT Slack Bot 🤖

Auto-escalation bot for `#it-internal`. Monitors the channel and pings two designated IT responders at **5, 10, and 15 minutes** if a request goes unanswered — all in the message's own thread.

---

## How It Works

```
User posts in #it-internal
        │
        ▼
Bot detects message (not from IT staff, not a reply)
        │
        ▼
3 delayed jobs queued: T+5min, T+10min, T+15min
        │
   ┌────┴─────────────────────────────────┐
   │  At each checkpoint, worker checks:  │
   │  • Is the message resolved?          │
   │  • Does the thread have a reply?     │
   │                                      │
   │  YES → Cancel remaining reminders   │
   │  NO  → Post reminder in thread      │
   └──────────────────────────────────────┘
```

### Escalation Messages

| Time | Message |
|------|---------|
| T+5 min | ⏰ *Reminder 1/3* — @responder1 @responder2, this request needs your attention. |
| T+10 min | 🔔 *Reminder 2/3* — 10 minutes have passed. |
| T+15 min | 🚨 *Final Alert (3/3)* — 15 minutes elapsed, please respond immediately. |

Reminders **stop automatically** as soon as:
- Anyone replies in the thread, OR
- An IT responder reacts with ✅ or 👀 to the original message

---

## Project Structure

```
it-slack-bot/
├── config/
│   └── index.js              # All config loaded from env vars
├── src/
│   ├── index.js              # Bot entry point (Slack Bolt app)
│   ├── worker.js             # BullMQ worker (separate process)
│   ├── redis.js              # Redis client + state helpers
│   ├── handlers/
│   │   ├── message.js        # Handles new messages in #it-internal
│   │   └── reaction.js       # Handles ✅/👀 emoji acknowledgments
│   ├── jobs/
│   │   └── scheduleEscalations.js  # Enqueues the 3 reminder jobs
│   └── utils/
│       └── slack.js          # Slack API helpers (post reminder, check replies)
├── .env.example              # Copy to .env and fill in
├── docker-compose.yml        # Runs Redis + bot + worker locally
├── Dockerfile
└── package.json
```

---

## Setup

### 1. Create the Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**
2. Name it `IT Bot` and select your workspace

#### Bot Token Scopes (OAuth & Permissions)
Add these under **OAuth & Permissions → Bot Token Scopes**:

| Scope | Purpose |
|-------|---------|
| `channels:history` | Read messages in `#it-internal` |
| `chat:write` | Post reminder replies in threads |
| `reactions:read` | Detect ✅/👀 emoji acknowledgments |
| `users:read` | Resolve user info |

#### Event Subscriptions
Enable under **Event Subscriptions**:

| Event | Purpose |
|-------|---------|
| `message.channels` | Detect new messages |
| `reaction_added` | Detect emoji acknowledgments |

#### Socket Mode (Development)
- Enable **Socket Mode** under the Socket Mode section
- Generate an **App-Level Token** with `connections:write` scope → this is your `SLACK_APP_TOKEN`

#### Install the App
- Go to **OAuth & Permissions** → **Install to Workspace**
- Copy the **Bot User OAuth Token** → this is your `SLACK_BOT_TOKEN`
- Copy the **Signing Secret** from **Basic Information** → this is your `SLACK_SIGNING_SECRET`

---

### 2. Get IDs

**Channel ID** (`IT_CHANNEL_ID`):
- Right-click on `#it-internal` in Slack → **View channel details** → scroll to bottom → copy ID (starts with `C`)

**User IDs** (`RESPONDER_1_ID`, `RESPONDER_2_ID`):
- Click on a team member's profile → **More** (⋮) → **Copy member ID** (starts with `U`)

---

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```env
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...

IT_CHANNEL_ID=C01234ABCDE
RESPONDER_1_ID=U01234ABCDE
RESPONDER_2_ID=U56789FGHIJ

REDIS_HOST=127.0.0.1
REDIS_PORT=6379
SLACK_MODE=socket
```

---

### 4. Run Locally

#### Option A — Docker Compose (recommended, zero setup)

```bash
docker compose up
```

This starts Redis, the bot, and the worker all together.

#### Option B — Manual

Make sure Redis is running locally (`redis-server`), then:

```bash
npm install

# Terminal 1: Start the bot
npm start

# Terminal 2: Start the worker
npm run worker
```

---

### 5. Invite the Bot to the Channel

In Slack, go to `#it-internal` and type:
```
/invite @IT Bot
```

---

## Production Deployment

For production, set `SLACK_MODE=http` and deploy behind a public HTTPS URL.

### Option A — Railway / Render / Fly.io

1. Push to GitHub
2. Connect your repo to Railway (or Render)
3. Create **two services** from the same repo:
   - **Bot service**: Start command `node src/index.js`
   - **Worker service**: Start command `node src/worker.js`
4. Add a **Redis** plugin/add-on
5. Set all environment variables in the dashboard

### Option B — PM2 (VPS / bare metal)

```bash
npm install -g pm2

pm2 start src/index.js --name it-bot
pm2 start src/worker.js --name it-worker
pm2 save
pm2 startup
```

### Events API URL (HTTP mode)
Set your Request URL in Slack's Event Subscriptions to:
```
https://your-domain.com/slack/events
```

---

## Customization

### Change Responders
Update `RESPONDER_1_ID` and `RESPONDER_2_ID` in `.env` — no code changes needed.

### Change Escalation Timing
Edit `config/index.js` → `escalation.reminders` array:
```js
reminders: [
  { delayMs: 5 * 60 * 1000,  label: "5 minutes",  step: 1 },
  { delayMs: 10 * 60 * 1000, label: "10 minutes", step: 2 },
  { delayMs: 15 * 60 * 1000, label: "15 minutes", step: 3 },
],
```

### Add More Responders
In `src/utils/slack.js` → `postReminder()`, add more `<@USER_ID>` mentions.
In `src/handlers/message.js`, extend the staff-skip guard.

### Keyword Filtering (Optional)
To only escalate messages containing specific keywords, add this to `src/handlers/message.js` after the other guards:
```js
const KEYWORDS = /help|issue|error|down|broken|urgent|access|request/i;
if (!KEYWORDS.test(message.text || "")) return;
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Bot doesn't respond to messages | Make sure it's invited to `#it-internal` with `/invite @IT Bot` |
| Reminders not posting | Check the worker is running (`npm run worker`) |
| `Missing required env var` error | Check your `.env` file has all required values |
| Redis connection refused | Make sure Redis is running (`redis-server` or `docker compose up redis`) |
| Bot responding to its own messages | This is guarded — ensure `SLACK_BOT_TOKEN` matches the installed app |
