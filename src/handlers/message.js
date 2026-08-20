// src/handlers/message.js
// Handles the `message` event from Slack for monitored channels.
// Schedules escalation reminders for all messages that pass the guard checks.

const config = require("../../config");
const { scheduleEscalations } = require("../jobs/scheduleEscalations");
const { getBotUserId } = require("../utils/slack");

function registerMessageHandler(app) {
  app.message(async ({ message, client, logger }) => {
    try {
      // ── Guard: only process messages in monitored channels ──────────────
      if (!config.channel.itChannelIds.includes(message.channel)) return;

      // ── Guard: ignore thread replies — only track top-level messages ────
      if (message.thread_ts && message.thread_ts !== message.ts) return;

      // ── Guard: ignore subtypes (edits, joins, etc.) ─────────────────────
      if (message.subtype) return;

      // ── Guard: ignore bot messages ───────────────────────────────────────
      const botUserId = await getBotUserId(client);
      if (message.user === botUserId) return;
      if (message.bot_id) return;

      // ── Guard: ignore messages from any IT responder ─────────────────────
      if (config.responders.ids.includes(message.user)) {
        logger.info(`[Handler] Skipping IT staff message from ${message.user}`);
        return;
      }

      // ── All checks passed: begin tracking this message ───────────────────
      logger.info(
        `[Handler] IT request from ${message.user} at ${message.ts}. Scheduling escalations.`
      );

      await scheduleEscalations(message.channel, message.ts, message.user);

    } catch (err) {
      logger.error("[Handler] Error processing message event:", err);
    }
  });
}

module.exports = { registerMessageHandler };
