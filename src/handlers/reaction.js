// src/handlers/reaction.js
const config = require("../../config");
const { resolveMessage, getMessageState } = require("../redis");
const { cancelEscalations } = require("../jobs/scheduleEscalations");

const ACK_EMOJIS = new Set(["white_check_mark", "eyes", "check", "checkmark"]);

function registerReactionHandler(app) {
  app.event("reaction_added", async ({ event, logger }) => {
    try {
      if (!ACK_EMOJIS.has(event.reaction)) return;

      // Only care about reactions from any IT responder
      if (!config.responders.ids.includes(event.user)) return;

      if (event.item.type !== "message") return;

      // Must be in one of the monitored channels
      if (!config.channel.itChannelIds.includes(event.item.channel)) return;

      const messageTs = event.item.ts;
      const state = await getMessageState(messageTs);
      if (!state || state.resolved) return;

      logger.info(`[Reaction] Responder ${event.user} acknowledged message ${messageTs} with :${event.reaction}:`);
      await resolveMessage(messageTs);
      await cancelEscalations(messageTs);

    } catch (err) {
      logger.error("[Reaction] Error processing reaction_added event:", err);
    }
  });
}

module.exports = { registerReactionHandler };
