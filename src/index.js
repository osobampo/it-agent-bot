// src/index.js
// Main entry point for the IT Slack Bot.
// Starts the Slack Bolt app in either Socket Mode (dev) or HTTP mode (prod).

require("dotenv").config();

const { App, LogLevel } = require("@slack/bolt");
const config = require("../config");
const { registerMessageHandler } = require("./handlers/message");
const { registerReactionHandler } = require("./handlers/reaction");
const { redis } = require("./redis");

// ── Create the Bolt app ──────────────────────────────────────────────────

const appOptions = {
  token: config.slack.botToken,
  signingSecret: config.slack.signingSecret,
  logLevel: LogLevel.INFO,
};

// Socket Mode is great for development (no public URL needed).
// Switch to HTTP mode for production by setting SLACK_MODE=http in .env
if (config.slack.mode === "socket") {
  appOptions.socketMode = true;
  appOptions.appToken = config.slack.appToken;
}

const app = new App(appOptions);

// ── Register event handlers ──────────────────────────────────────────────

registerMessageHandler(app);
registerReactionHandler(app);

// ── Start the app ────────────────────────────────────────────────────────

(async () => {
  try {
    // Verify Redis is reachable before starting
    await redis.ping();
    console.log("[App] Redis connection verified");

    if (config.slack.mode === "socket") {
      await app.start();
      console.log("[App] ⚡ IT Slack Bot running in Socket Mode");
    } else {
      await app.start(config.slack.port);
      console.log(`[App] ⚡ IT Slack Bot running on port ${config.slack.port} (HTTP mode)`);
    }

    console.log(`[App] Monitoring channel: ${config.channel.itChannelId}`);
    console.log(
      `[App] Escalation responders: <@${config.responders.primary}> and <@${config.responders.secondary}>`
    );
    console.log("[App] Escalation schedule: 5min → 10min → 15min");
  } catch (err) {
    console.error("[App] Fatal startup error:", err);
    process.exit(1);
  }
})();

// ── Graceful shutdown ────────────────────────────────────────────────────

async function shutdown(signal) {
  console.log(`[App] ${signal} received, shutting down...`);
  try {
    await app.stop();
    await redis.quit();
  } catch (err) {
    console.error("[App] Error during shutdown:", err.message);
  }
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
