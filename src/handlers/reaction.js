// src/handlers/reaction.js
// Handles emoji reactions added to messages in #it-internal.
// When @responder-1 or @responder-2 reacts with ✅ or 👀,
// the message is marked resolved and no further reminders are sent.

const config = require("../../config");
const { resolveMessage, getMessageState } = require("../redis");
const { cancelEscalations } = require("../jobs/scheduleEscalations");

// Emojis that count as an IT acknowledgment
const ACK_EMOJIS = new Set(["white_check_mark", "eyes", "check", "checkmark"]);

/**
 * Register the reaction_added handler on the Bolt app.
 * @param {import('@slack/bolt').App} app
 */
function registerReactionHandler(app) {
  app.event("reaction_added", async ({ event, logger }) => {
    try {
      // Only care about acknowledgment emojis
      if (!ACK_EMOJIS.has(event.reaction)) return;

      // Only care about reactions from the two designated responders
      const { primary, secondary } = config.responders;
      if (event.user !== primary && event.user !== secondary) return;

      // The item must be a message (not a file, etc.)
      if (event.item.type !== "message") return;

      // The reacted message must be in #it-internal
      if (event.item.channel !== config.channel.itChannelId) return;

      const messageTs = event.item.ts;

      // Look up state — only act if we're tracking this message
      const state = await getMessageState(messageTs);
      if (!state) return;
      if (state.resolved) return;

      logger.info(
        `[Reaction] Responder ${event.user} acknowledged message ${messageTs} with :${event.reaction}:`
      );

      // Mark resolved and attempt to cancel pending jobs
      await resolveMessage(messageTs);
      await cancelEscalations(messageTs);
    } catch (err) {
      logger.error("[Reaction] Error processing reaction_added event:", err);
    }
  });
}

module.exports = { registerReactionHandler };
