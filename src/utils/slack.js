// src/utils/slack.js
const config = require("../../config");

/**
 * Check whether any IT responder has replied in the thread.
 */
async function threadHasResponderReply(client, channelId, threadTs) {
  try {
    const result = await client.conversations.replies({
      channel: channelId,
      ts: threadTs,
      limit: 50,
    });

    const replies = result.messages || [];
    const responderReplied = replies.slice(1).some((msg) =>
      config.responders.ids.includes(msg.user)
    );

    return responderReplied;
  } catch (err) {
    console.error("[Slack] Error fetching thread replies:", err.message);
    return true;
  }
}

/**
 * Post a reminder message into a thread.
 */
async function postReminder(client, channelId, threadTs, step) {
  const group = `<!subteam^S04P1M61QGK|it>`;
  // Tag all responders individually for steps 2 and 3
  const mentions = config.responders.ids.map(id => `<@${id}>`).join(" ");

  const messages = {
    1: `👋 Hey ${group} — someone needs a hand here!`,
    2: `🔔 ${mentions} — this request is still open, someone needs help!`,
    3: `🚨 ${mentions} — still no response here, can one of you jump in?`,
  };

  const text = messages[step];
  if (!text) return;

  await client.chat.postMessage({
    channel: channelId,
    thread_ts: threadTs,
    text,
  });

  console.log(`[Bot] Posted reminder step ${step} for thread ${threadTs}`);
}

let _botUserId = null;

async function getBotUserId(client) {
  if (_botUserId) return _botUserId;
  const auth = await client.auth.test();
  _botUserId = auth.user_id;
  return _botUserId;
}

module.exports = { threadHasResponderReply, postReminder, getBotUserId };
