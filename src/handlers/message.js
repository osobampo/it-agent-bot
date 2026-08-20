// src/handlers/message.js
const config = require("../../config");
const { scheduleEscalations } = require("../jobs/scheduleEscalations");
const { getBotUserId } = require("../utils/slack");
const { isItRequest } = require("../utils/gemini");

function registerMessageHandler(app) {
  app.message(async ({ message, client, logger }) => {
    try {
      // ── Guard: only process messages in monitored channels ───────────────
      if (!config.channel.itChannelIds.includes(message.channel)) return;

      // ── Guard: ignore thread replies ─────────────────────────────────────
      if (message.thread_ts && message.thread_ts !== message.ts) return;

      // ── Guard: ignore subtypes ───────────────────────────────────────────
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

      // ── AI Classification ────────────────────────────────────────────────
      const messageText = message.text || "";
      logger.info(`[Handler] Classifying message from ${message.user}: "${messageText.slice(0, 80)}..."`);

      const needsAttention = await isItRequest(messageText);
      if (!needsAttention) {
        logger.info(`[Handler] Gemini classified message as non-request — skipping.`);
        return;
      }

      // ── Schedule escalations ─────────────────────────────────────────────
      logger.info(`[Handler] IT request confirmed from ${message.user} at ${message.ts}. Scheduling escalations.`);
      await scheduleEscalations(message.channel, message.ts, message.user);

    } catch (err) {
      logger.error("[Handler] Error processing message event:", err);
    }
  });
}

module.exports = { registerMessageHandler };
