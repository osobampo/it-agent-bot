// src/worker.js
// BullMQ worker — runs as a SEPARATE process from the Slack bot.
// It picks up delayed escalation jobs and, for each:
//   1. Checks if the message has already been resolved
//   2. Checks if the thread has any human replies
//   3. If neither: posts the reminder and tags @responder-1 / @responder-2
//
// Run with:  node src/worker.js
// Or in parallel with the bot via your process manager (pm2, Docker Compose, etc.)

require("dotenv").config();

const { Worker } = require("bullmq");
const { WebClient } = require("@slack/web-api");
const config = require("../config");
const { isResolved, resolveMessage, saveMessageState } = require("./redis");
const { threadHasResponderReply, postReminder } = require("./utils/slack");

const slackClient = new WebClient(config.slack.botToken);

const worker = new Worker(
  config.queueName,
  async (job) => {
    const { channelId, messageTs, threadTs, step, label } = job.data;

    console.log(`[Worker] Processing escalation step ${step} (${label}) for message ${messageTs}`);

    // ── Check 1: Is the message already resolved? ────────────────────────
    const resolved = await isResolved(messageTs);
    if (resolved) {
      console.log(`[Worker] Message ${messageTs} is already resolved. Skipping step ${step}.`);
      return;
    }

    // ── Check 2: Does the thread have any human replies? ─────────────────
    const hasReply = await threadHasResponderReply(slackClient, channelId, threadTs);
    if (hasReply) {
      console.log(`[Worker] Thread ${threadTs} has replies. Marking resolved, skipping step ${step}.`);
      await resolveMessage(messageTs);
      return;
    }

    // ── No response found: post the reminder ────────────────────────────
    await postReminder(slackClient, channelId, threadTs, step);

    // Record that this reminder was sent
    await saveMessageState(messageTs, {
      [`reminders.sent_${step}`]: true,
      [`reminders.sentAt_${step}`]: new Date().toISOString(),
    });

    console.log(`[Worker] Reminder step ${step} sent for message ${messageTs}`);
  },
  {
    connection: {
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password || undefined,
    },
    concurrency: 10, // Process up to 10 jobs simultaneously
  }
);

// ── Worker lifecycle events ──────────────────────────────────────────────

worker.on("completed", (job) => {
  console.log(`[Worker] Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed:`, err.message);
});

worker.on("error", (err) => {
  console.error("[Worker] Worker error:", err.message);
});

console.log("[Worker] Started and waiting for escalation jobs...");

// ── Graceful shutdown ────────────────────────────────────────────────────
process.on("SIGTERM", async () => {
  console.log("[Worker] SIGTERM received, shutting down gracefully...");
  await worker.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[Worker] SIGINT received, shutting down gracefully...");
  await worker.close();
  process.exit(0);
});
