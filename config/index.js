// config/index.js
// All configuration loaded from environment variables.
// Never hard-code tokens or IDs — use .env

require("dotenv").config();

function required(key) {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

module.exports = {
  slack: {
    botToken: required("SLACK_BOT_TOKEN"),
    signingSecret: required("SLACK_SIGNING_SECRET"),
    appToken: process.env.SLACK_APP_TOKEN, // only needed in socket mode
    mode: process.env.SLACK_MODE || "socket", // "socket" | "http"
    port: parseInt(process.env.PORT || "3000", 10),
  },

  channel: {
    // Comma-separated list of Slack channel IDs to monitor
    itChannelIds: required("IT_CHANNEL_IDS").split(",").map((id) => id.trim()),
    // Channel to forward unresolved messages to on steps 2 and 3
    escalationChannelId: required("ESCALATION_CHANNEL_ID"),
  },

  responders: {
    // Comma-separated Slack user IDs of IT responders
    ids: required("RESPONDER_IDS").split(",").map((id) => id.trim()),
  },

  escalation: {
    // Reminder intervals in milliseconds
    reminders: [
      { delayMs: 5 * 60 * 1000, label: "5 minutes", step: 1 },
      { delayMs: 10 * 60 * 1000, label: "10 minutes", step: 2 },
      { delayMs: 15 * 60 * 1000, label: "15 minutes", step: 3 },
    ],
  },

  redis: {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  // BullMQ queue name
  queueName: "it-escalation",
};
