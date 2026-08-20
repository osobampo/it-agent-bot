// src/redis.js
// Shared Redis connection used by both the bot (producer)
// and the worker (consumer). Import this wherever you need
// to enqueue jobs or access raw Redis.

const { Queue } = require("bullmq");
const Redis = require("ioredis");
const config = require("../config");

// ── Raw Redis client (for storing message state) ──────────────────────────
const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password || undefined,
  maxRetriesPerRequest: null, // Required by BullMQ
});

redis.on("error", (err) => {
  console.error("[Redis] Connection error:", err.message);
});

redis.on("connect", () => {
  console.log("[Redis] Connected");
});

// ── BullMQ Queue (producer side) ──────────────────────────────────────────
const escalationQueue = new Queue(config.queueName, {
  connection: {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined,
  },
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: 1000, // Keep last 1000 failed jobs for debugging
  },
});

// ── State key helpers ──────────────────────────────────────────────────────
// We store a small JSON record per tracked message in Redis.
// Key format:  it-bot:msg:<messageTs>
const stateKey = (messageTs) => `it-bot:msg:${messageTs}`;

/**
 * Save or update a message tracking record.
 * @param {string} messageTs  - Slack message timestamp (unique ID)
 * @param {object} data       - Fields to merge into the record
 */
async function saveMessageState(messageTs, data) {
  const existing = await getMessageState(messageTs);
  const updated = { ...existing, ...data, messageTs };
  // TTL: 2 hours — messages older than that don't need tracking
  await redis.set(stateKey(messageTs), JSON.stringify(updated), "EX", 7200);
}

/**
 * Retrieve a message tracking record.
 * @param {string} messageTs
 * @returns {object|null}
 */
async function getMessageState(messageTs) {
  const raw = await redis.get(stateKey(messageTs));
  return raw ? JSON.parse(raw) : null;
}

/**
 * Mark a message as resolved (cancels further reminders).
 * @param {string} messageTs
 */
async function resolveMessage(messageTs) {
  await saveMessageState(messageTs, {
    resolved: true,
    resolvedAt: new Date().toISOString(),
  });
}

/**
 * Check whether a message has been resolved.
 * @param {string} messageTs
 * @returns {boolean}
 */
async function isResolved(messageTs) {
  const state = await getMessageState(messageTs);
  return state ? state.resolved === true : false;
}

module.exports = {
  redis,
  escalationQueue,
  saveMessageState,
  getMessageState,
  resolveMessage,
  isResolved,
};
