#!/usr/bin/env node

/**
 * Inbound Chat Worker
 * Polls the OpenClaw Mission Control ingest endpoint to process incoming chat messages.
 */

const INTERVAL_MS = parseInt(process.env.INBOUND_CHAT_INGEST_INTERVAL_MS || '5000', 10);
const MISSION_CONTROL_URL = process.env.MISSION_CONTROL_URL || 'http://127.0.0.1:3000';
const INGEST_URL = process.env.INBOUND_CHAT_INGEST_URL || `${MISSION_CONTROL_URL}/api/openclaw/chat/ingest`;
const API_KEY = process.env.AGENT_API_KEY;

console.log(`[inbound-chat-worker] Starting worker`);
console.log(`  URL: ${INGEST_URL}`);
console.log(`  Interval: ${INTERVAL_MS}ms`);
console.log(`  API Key: ${API_KEY ? 'configured' : 'none'}`);

async function pollIngest() {
  try {
    const headers = {
      'Content-Type': 'application/json',
    };

    if (API_KEY) {
      headers['x-api-key'] = API_KEY;
    }

    const response = await fetch(INGEST_URL, {
      method: 'POST',
      headers,
    });

    if (!response.ok) {
      console.error(`[inbound-chat-worker] Error: HTTP ${response.status} ${response.statusText}`);
      const text = await response.text();
      if (text) {
        console.error(`[inbound-chat-worker] Response: ${text}`);
      }
      return;
    }

    const data = await response.json();

    if (data.insertedMessages > 0) {
      console.log(`[inbound-chat-worker] Ingested ${data.insertedMessages} message(s)`);
    }
  } catch (error) {
    console.error(`[inbound-chat-worker] Error polling ingest endpoint:`, error.message);
  }
}

// Initial poll
pollIngest();

// Set up interval
setInterval(pollIngest, INTERVAL_MS);
