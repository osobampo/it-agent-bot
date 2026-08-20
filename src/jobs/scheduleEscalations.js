// src/jobs/scheduleEscalations.js
// Enqueues the three escalation reminder jobs into BullMQ
// when a new trackable message is detected.

const { escalationQueue, saveMessageState } = require("../redis");
const config = require("../../config");

/**
 * Schedule all three escalation reminders for a new message.
 *
 * @param {string} channelId   - Slack channel ID
 * @param {string} messageTs   - Slack message timestamp (used as unique ID)
 * @param {string} authorId    - Slack user ID of the message author
 */
async function scheduleEscalations(channelId, messageTs, authorId) {
  // Persist initial state
  await saveMessageState(messageTs, {
    channelId,
    threadTs: messageTs, // top-level message, so threadTs == messageTs
    authorId,
    resolved: false,
    createdAt: new Date().toISOString(),
    reminders: { sent_1: false, sent_2: false, sent_3: false },
  });

  // Enqueue one delayed job per escalation step
  // Note: BullMQ job IDs cannot contain ":" — replace with "_"
  const safeMsgId = messageTs.replace(/\./g, "_");
  for (const reminder of config.escalation.reminders) {
    const jobId = `${safeMsgId}_step${reminder.step}`;

    await escalationQueue.add(
      "escalation-check",
      {
        channelId,
        messageTs,
        threadTs: messageTs,
        step: reminder.step,
        label: reminder.label,
      },
      {
        delay: reminder.delayMs,
        jobId, // Idempotent: same job won't be added twice
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      }
    );

    console.log(
      `[Queue] Scheduled step ${reminder.step} (${reminder.label}) for message ${messageTs}`
    );
  }
}

/**
 * Remove any pending escalation jobs for a message that was resolved.
 * BullMQ doesn't allow cancelling delayed jobs by default, so we rely
 * on the worker checking `isResolved()` before posting — but we also
 * attempt to remove them here as a belt-and-suspenders measure.
 *
 * @param {string} messageTs
 */
async function cancelEscalations(messageTs) {
  const safeMsgId = messageTs.replace(/\./g, "_");
  for (let step = 1; step <= 3; step++) {
    const jobId = `${safeMsgId}_step${step}`;
    try {
      const job = await escalationQueue.getJob(jobId);
      if (job) {
        await job.remove();
        console.log(`[Queue] Removed job ${jobId}`);
      }
    } catch {
      // Job may have already run or been removed — that's fine
    }
  }
}

module.exports = { scheduleEscalations, cancelEscalations };
