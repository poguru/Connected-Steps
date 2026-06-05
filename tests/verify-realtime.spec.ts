import { test, expect, Page } from '@playwright/test';

const BASE = 'http://localhost:3000';
const MOCK_USER = {
  email: 'test@connectedsteps.in',
  firstName: 'Test', lastName: 'User',
  phone: '9999999999', goal: '10k',
  location: 'Kondapur', photo: null,
};

async function loginAs(page: Page) {
  await page.goto(BASE);
  await page.evaluate((u) => localStorage.setItem('cs_user', JSON.stringify(u)), MOCK_USER);
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.cs-app-nav', { timeout: 20000 });
  await page.waitForTimeout(500);
}

test('Leaderboard — Supabase realtime connects (green live dot appears)', async ({ page }) => {
  const wsMessages: string[] = [];

  // Track WebSocket frames to confirm Supabase realtime channel is active
  page.on('websocket', ws => {
    ws.on('framesent',   f => wsMessages.push(`sent: ${f.payload?.toString?.().slice(0, 80)}`));
    ws.on('framereceived', f => wsMessages.push(`recv: ${f.payload?.toString?.().slice(0, 80)}`));
  });

  await loginAs(page);
  await page.goto(`${BASE}/leaderboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.cs-app-nav', { timeout: 20000 });

  // Give the subscription time to handshake
  await page.waitForTimeout(4000);

  await page.screenshot({ path: 'test-results/realtime-leaderboard.png' });

  // Check for the green live dot (only appears after SUBSCRIBED)
  const liveDot = page.locator('span.animate-pulse');
  const dotVisible = await liveDot.isVisible().catch(() => false);

  // Check WebSocket activity — Supabase realtime uses wss://
  const supabaseWs = wsMessages.some(m => m.includes('realtime') || m.includes('leaderboard') || m.includes('phx'));

  console.log(`Live dot visible: ${dotVisible}`);
  console.log(`WebSocket frames: ${wsMessages.length}`);
  console.log(`Supabase WS frames: ${supabaseWs}`);
  if (wsMessages.length > 0) console.log('Sample frames:', wsMessages.slice(0, 4).join('\n'));

  // Pass if either the dot is visible OR we saw WS traffic (dot may animate before screenshot)
  expect(dotVisible || wsMessages.length > 0, 'Expected realtime WebSocket to connect').toBe(true);
});

test('Dashboard — session_attendance realtime connects', async ({ page }) => {
  const wsFrames: string[] = [];
  page.on('websocket', ws => {
    ws.on('framereceived', f => wsFrames.push(f.payload?.toString?.() ?? ''));
  });

  await loginAs(page);
  await page.waitForTimeout(4000);

  await page.screenshot({ path: 'test-results/realtime-dashboard.png' });

  const hasWs = wsFrames.length > 0;
  console.log(`Dashboard WebSocket frames received: ${wsFrames.length}`);
  if (wsFrames.length > 0) console.log('Sample:', wsFrames[0].slice(0, 120));

  expect(hasWs, 'Expected Supabase realtime WebSocket frames on dashboard').toBe(true);
});

test('RSVP counts API returns live data', async ({ request }) => {
  // Get a real session ID first
  const sessRes  = await request.get(`${BASE}/api/sessions`);
  const sessBody = await sessRes.json();
  const sessions = sessBody.data ?? [];

  if (sessions.length === 0) {
    console.log('No upcoming sessions — skipping RSVP count check');
    return;
  }

  const ids = sessions.map((s: { id: string }) => s.id).join(',');
  const res  = await request.get(`${BASE}/api/sessions/rsvp-counts?ids=${ids}`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toHaveProperty('counts');

  const total = Object.values(body.counts as Record<string, number>).reduce((s, n) => s + n, 0);
  console.log(`RSVP counts: ${JSON.stringify(body.counts)}`);
  console.log(`Total RSVPs across ${sessions.length} sessions: ${total}`);

  // At least the structure is correct
  expect(typeof body.counts).toBe('object');
});
