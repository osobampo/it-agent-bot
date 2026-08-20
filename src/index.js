// src/index.js
require("dotenv").config();

const { App, LogLevel } = require("@slack/bolt");
const config = require("../config");
const { registerMessageHandler } = require("./handlers/message");
const { registerReactionHandler } = require("./handlers/reaction");
const { redis } = require("./redis");

const appOptions = {
  token: config.slack.botToken,
  signingSecret: config.slack.signingSecret,
  logLevel: LogLevel.INFO,
};

if (config.slack.mode === "socket") {
  appOptions.socketMode = true;
  appOptions.appToken = config.slack.appToken;
}

const app = new App(appOptions);

registerMessageHandler(app);
registerReactionHandler(app);

(async () => {
  try {
    await redis.ping();
    console.log("[App] Redis connection verified");

    if (config.slack.mode === "socket") {
      await app.start();
      console.log("[App] ⚡ IT Slack Bot running in Socket Mode");
    } else {
      await app.start(config.slack.port);
      console.log(`[App] ⚡ IT Slack Bot running on port ${config.slack.port}`);
    }

    console.log(`[App] Monitoring channels: ${config.channel.itChannelIds.join(", ")}`);
    console.log(`[App] Escalation responders: ${config.responders.ids.map(id => `<@${id}>`).join(", ")}`);
    console.log("[App] Escalation schedule: 5min → 10min → 15min");
  } catch (err) {
    console.error("[App] Fatal startup error:", err);
    process.exit(1);
  }
})();

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
