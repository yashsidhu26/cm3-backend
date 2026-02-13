/**
 * Streaming Endpoint Tests
 * Tests the chat-stream endpoint with SSE
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { Subprocess } from 'bun';

let serverProcess: Subprocess;
let sessionToken: string;
const BASE_URL = 'http://localhost:3000';

beforeAll(async () => {
  console.log('Starting server...');
  // Start the server
  serverProcess = Bun.spawn(['bun', 'src/app.ts'], {
    stdout: 'inherit',
    stderr: 'inherit',
  });

  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Create a test user and get session token
  try {
    // Try to sign in with test user
    const signInRes = await fetch(`${BASE_URL}/api/auth/moodle/sign-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'test_user',
        password: 'test_password',
        moodleUrl: 'https://nalanda.bits-pilani.ac.in',
      }),
    });

    if (signInRes.ok) {
      const cookies = signInRes.headers.get('set-cookie');
      if (cookies) {
        const match = cookies.match(/super-app\.session_token=([^;]+)/);
        if (match) {
          sessionToken = match[1];
          console.log('Got session token from sign-in');
        }
      }
    }
  } catch (error) {
    console.log('Could not create test user, tests will skip auth-required tests');
  }
});

afterAll(() => {
  console.log('Stopping server...');
  serverProcess.kill();
});

describe('Streaming Endpoint', () => {
  test('should return 401 without authentication', async () => {
    const response = await fetch(`${BASE_URL}/api/ai-integration/chat-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({
        query: 'What is 2+2?',
        format: 'text',
      }),
    });

    expect(response.status).toBe(401);
  });

  test('should return 400 for invalid request body', async () => {
    if (!sessionToken) {
      console.log('Skipping test - no session token');
      return;
    }

    const response = await fetch(`${BASE_URL}/api/ai-integration/chat-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Cookie': `super-app.session_token=${sessionToken}`,
      },
      body: JSON.stringify({
        // Missing required 'query' field
        format: 'text',
      }),
    });

    expect(response.status).toBe(400);
  });

  test('should stream events with valid request', async () => {
    if (!sessionToken) {
      console.log('Skipping test - no session token');
      return;
    }

    const response = await fetch(`${BASE_URL}/api/ai-integration/chat-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Cookie': `super-app.session_token=${sessionToken}`,
      },
      body: JSON.stringify({
        query: 'What is 2+2?',
        format: 'text',
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');

    // Read stream
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const events: Array<{ type: string; data: any }> = [];
    let timeout = false;

    // Set timeout
    const timeoutId = setTimeout(() => {
      timeout = true;
      reader.cancel();
    }, 30000); // 30 second timeout

    try {
      while (!timeout) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const messages = buffer.split('\n\n');
        buffer = messages.pop() || '';

        for (const message of messages) {
          if (!message.trim()) continue;

          const lines = message.split('\n');
          let eventType = 'message';
          let data = '';

          for (const line of lines) {
            if (line.startsWith('event:')) {
              eventType = line.substring(6).trim();
            } else if (line.startsWith('data:')) {
              data = line.substring(5).trim();
            }
          }

          if (data) {
            try {
              events.push({
                type: eventType,
                data: JSON.parse(data),
              });

              // Stop when we get complete or error
              if (eventType === 'complete' || eventType === 'error') {
                reader.cancel();
                break;
              }
            } catch (e) {
              console.error('Failed to parse event data:', data);
            }
          }
        }
      }
    } finally {
      clearTimeout(timeoutId);
    }

    // Verify we got events
    expect(events.length).toBeGreaterThan(0);

    // Should have status events
    const statusEvents = events.filter(e => e.type === 'status');
    expect(statusEvents.length).toBeGreaterThan(0);

    // Should have chunk events (response text)
    const chunkEvents = events.filter(e => e.type === 'chunk');
    expect(chunkEvents.length).toBeGreaterThan(0);

    // Should end with complete or error
    const lastEvent = events[events.length - 1];
    expect(['complete', 'error']).toContain(lastEvent.type);

    console.log(`Received ${events.length} events`);
    console.log('Event types:', events.map(e => e.type));
  }, 35000); // 35 second timeout for the test

  test('should handle empty query', async () => {
    if (!sessionToken) {
      console.log('Skipping test - no session token');
      return;
    }

    const response = await fetch(`${BASE_URL}/api/ai-integration/chat-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Cookie': `super-app.session_token=${sessionToken}`,
      },
      body: JSON.stringify({
        query: '',
        format: 'text',
      }),
    });

    // Should fail validation
    expect(response.status).toBe(400);
  });
});
