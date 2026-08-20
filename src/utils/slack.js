// src/utils/slack.js
// Utility functions that wrap Slack Web API calls.
// The `client` passed here is the Slack WebClient from Bolt.

const config = require("../../config");

/**
 * Check whether a designated IT responder has replied in the thread.
 * Only @responder1 or @responder2 replying counts as a resolution —
 * replies from other users (including the original requester) do not stop reminders.
 */
async function threadHasResponderReply(client, channelId, threadTs) {
  try {
    const result = await client.conversations.replies({
      channel: channelId,
      ts: threadTs,
      limit: 50,
    });

    const { ids } = config.responders;
    const replies = result.messages || [];

    // replies[0] is always the parent message; check from index 1 onward
    const responderReplied = replies.slice(1).some((msg) => ids.includes(msg.user));

    return responderReplied;
  } catch (err) {
    console.error("[Slack] Error fetching thread replies:", err.message);
    // On error, assume resolved to avoid spamming
    return true;
  }
}

/**
 * Post a reminder message into a thread.
 * For steps 2 and 3, also forwards the message to the escalation channel tagging @it.
 */
async function postReminder(client, channelId, threadTs, step) {
  const { ids } = config.responders;
  const mentions = ids.map((id) => `<@${id}>`).join(" ");
  const group = `<!subteam^S04P1M61QGK|it>`;

  const messages = {
    1: `👋 Hey ${group} — someone needs a hand here!`,
    2: `⏳ ${mentions} — still open! Whenever you're free.`,
    3: `🚨 ${mentions} — 15 mins in, this one really needs attention ASAP!`,
  };

  const text = messages[step];
  if (!text) return;

  // Step 1 only: post the reminder in the original thread
  // Steps 2 and 3 go to the escalation channel only (see below)
  if (step === 1) {
    await client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text,
    });
    console.log(`[Bot] Posted reminder step ${step} for thread ${threadTs}`);
  }

  // Steps 2 and 3: also forward to the escalation channel with a Slack-style forwarded visual
  if (step >= 2) {
    try {
      const { escalationChannelId } = config.channel;

      // Fetch the original message text and author
      const history = await client.conversations.history({
        channel: channelId,
        latest: threadTs,
        inclusive: true,
        limit: 1,
      });
      const originalMessage = history.messages?.[0];
      const originalText = originalMessage?.text || "(no message text)";
      const authorId = originalMessage?.user;

      // Fetch the author's display name, avatar, and profile link
      let authorName = "Unknown";
      let authorIcon = undefined;
      let authorLink = undefined;
      if (authorId) {
        const userInfo = await client.users.info({ user: authorId });
        authorName = userInfo.user?.profile?.display_name || userInfo.user?.real_name || "Unknown";
        authorIcon = userInfo.user?.profile?.image_48;
        const workspaceUrl = await getWorkspaceUrl(client);
        authorLink = `${workspaceUrl}team/${authorId}`;
      }

      // Get a permalink to the original message
      const { permalink } = await client.chat.getPermalink({
        channel: channelId,
        message_ts: threadTs,
      });

      // Embed timestamp using Slack date token so we control the order
      // and avoid the auto-appended "Added by IT Agent" that the ts field triggers
      const unixTs = Math.floor(parseFloat(threadTs));
      const formattedTs = `<!date^${unixTs}^{date_short_pretty} at {time}|${new Date(unixTs * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}>`;

      const intros = {
        2: `${group} — an unanswered request in <#${channelId}> is still open after 10 minutes.`,
        3: `${group} — 🚨 this request has been waiting 15+ minutes with no response.`,
      };

      await client.chat.postMessage({
        channel: escalationChannelId,
        text: intros[step],
        attachments: [
          {
            color: "#E8E8E8",
            author_name: authorName,
            author_icon: authorIcon,
            author_link: authorLink,
            text: originalText,
            footer: `Thread in <#${channelId}>  ·  ${formattedTs}  ·  <${permalink}|View message>`,
          },
        ],
      });

      console.log(`[Bot] Forwarded step ${step} escalation to escalation channel for thread ${threadTs}`);
    } catch (err) {
      console.error(`[Bot] Failed to forward to escalation channel at step ${step}:`, err.message);
    }
  }
}

// Cache the bot's own user ID and workspace URL
let _botUserId = null;
let _workspaceUrl = null;

async function getBotUserId(client) {
  if (_botUserId) return _botUserId;
  const auth = await client.auth.test();
  _botUserId = auth.user_id;
  _workspaceUrl = auth.url;
  return _botUserId;
}

async function getWorkspaceUrl(client) {
  if (_workspaceUrl) return _workspaceUrl;
  const auth = await client.auth.test();
  _workspaceUrl = auth.url;
  return _workspaceUrl;
}

module.exports = {
  threadHasResponderReply,
  postReminder,
  getBotUserId,
  getWorkspaceUrl,
};
