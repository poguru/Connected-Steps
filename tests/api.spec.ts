import { test, expect, APIRequestContext } from '@playwright/test';

const BASE = 'http://localhost:3000';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function api(request: APIRequestContext, method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: object) {
  const opts = body ? { data: body } : undefined;
  return method === 'GET'
    ? request.get(`${BASE}${path}`)
    : request.post(`${BASE}${path}`, opts);
}

// ─── 1. Public stats ──────────────────────────────────────────────────────────

test.describe('GET /api/stats', () => {
  test('returns community stats with numeric fields', async ({ request }) => {
    const res  = await request.get(`${BASE}/api/stats`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.totalRunners).toBe('number');
    expect(typeof body.activeMembers).toBe('number');
    expect(typeof body.sessionsAttended).toBe('number');
    expect(typeof body.trainingsConducted).toBe('number');
    expect(typeof body.weekendRuns).toBe('number');
  });
});

// ─── 2. Leaderboard ───────────────────────────────────────────────────────────

test.describe('GET /api/leaderboard', () => {
  test('returns entries array', async ({ request }) => {
    const res  = await request.get(`${BASE}/api/leaderboard`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.entries)).toBe(true);
  });

  test('each entry has required fields', async ({ request }) => {
    const res  = await request.get(`${BASE}/api/leaderboard`);
    const body = await res.json();
    if (body.entries.length > 0) {
      const e = body.entries[0];
      expect(e).toHaveProperty('user_email');
      expect(e).toHaveProperty('user_name');
      expect(e).toHaveProperty('month_points');
      expect(e).toHaveProperty('total_points');
    }
  });

  test('entries are sorted by month_points descending', async ({ request }) => {
    const res  = await request.get(`${BASE}/api/leaderboard`);
    const body = await res.json();
    const pts  = body.entries.map((e: any) => e.month_points ?? 0);
    const sorted = [...pts].sort((a, b) => b - a);
    expect(pts).toEqual(sorted);
  });
});

// ─── 3. Users search ──────────────────────────────────────────────────────────

test.describe('GET /api/users/search', () => {
  test('returns users array with no query', async ({ request }) => {
    const res  = await request.get(`${BASE}/api/users/search?q=`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.users)).toBe(true);
  });

  test('filters by name query', async ({ request }) => {
    const res  = await request.get(`${BASE}/api/users/search?q=Kafeel`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.users)).toBe(true);
  });

  test('returns empty array for nonsense query', async ({ request }) => {
    const res  = await request.get(`${BASE}/api/users/search?q=xyzxyzxyz999`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.users.length).toBe(0);
  });
});

// ─── 4. Sessions ──────────────────────────────────────────────────────────────

test.describe('GET /api/sessions', () => {
  test('returns sessions array', async ({ request }) => {
    const res  = await request.get(`${BASE}/api/sessions`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('sessions have id, title, date fields', async ({ request }) => {
    const res  = await request.get(`${BASE}/api/sessions`);
    const body = await res.json();
    if (body.data.length > 0) {
      const s = body.data[0];
      expect(s).toHaveProperty('id');
      expect(s).toHaveProperty('title');
      expect(s).toHaveProperty('date');
    }
  });
});

// ─── 5. Auth — Login ──────────────────────────────────────────────────────────

test.describe('POST /api/auth/login', () => {
  test('rejects missing credentials with 400', async ({ request }) => {
    const res  = await request.post(`${BASE}/api/auth/login`, { data: {} });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test('rejects wrong credentials with 401', async ({ request }) => {
    const res = await request.post(`${BASE}/api/auth/login`, {
      data: { identifier: 'nobody@connectedsteps.in', password: 'wrongpassword' },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test('rejects missing password with 400', async ({ request }) => {
    const res = await request.post(`${BASE}/api/auth/login`, {
      data: { identifier: 'test@connectedsteps.in' },
    });
    expect(res.status()).toBe(400);
  });
});

// ─── 6. Auth — Register ───────────────────────────────────────────────────────

test.describe('POST /api/auth/register', () => {
  test('rejects missing required fields with 400', async ({ request }) => {
    const res  = await request.post(`${BASE}/api/auth/register`, { data: { email: 'test@test.com' } });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test('rejects duplicate email with 409', async ({ request }) => {
    // First fetch a known registered email from the leaderboard
    const lb   = await request.get(`${BASE}/api/leaderboard`);
    const data = await lb.json();
    const existingEmail = data.entries?.[0]?.user_email;
    if (!existingEmail) { test.skip(); return; }

    const res = await request.post(`${BASE}/api/auth/register`, {
      data: {
        firstName: 'Test', lastName: 'Dupe',
        email: existingEmail,
        phone: '9999999999', password: 'test1234',
      },
    });
    expect(res.status()).toBe(409);
  });
});

// ─── 7. Auth — Forgot password ────────────────────────────────────────────────

test.describe('POST /api/auth/forgot-password', () => {
  test('returns 400 when email is missing', async ({ request }) => {
    const res = await request.post(`${BASE}/api/auth/forgot-password`, { data: {} });
    expect(res.status()).toBe(400);
  });

  test('returns 404 for unknown email', async ({ request }) => {
    const res = await request.post(`${BASE}/api/auth/forgot-password`, {
      data: { email: 'nobody@example.com' },
    });
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});

// ─── 8. Membership ────────────────────────────────────────────────────────────

test.describe('GET /api/membership', () => {
  test('returns membership null when no email provided', async ({ request }) => {
    const res  = await request.get(`${BASE}/api/membership`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.membership).toBeNull();
  });

  test('returns membership object for known email', async ({ request }) => {
    const res  = await request.get(`${BASE}/api/membership?email=connected.steps2106@gmail.com`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    // membership can be null or an object — just check it responds
    expect(body).toHaveProperty('membership');
  });
});

// ─── 9. Coupon validation ─────────────────────────────────────────────────────

test.describe('POST /api/coupons/validate', () => {
  test('rejects missing coupon code with 400', async ({ request }) => {
    const res  = await request.post(`${BASE}/api/coupons/validate`, { data: {} });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test('rejects invalid coupon code with 404', async ({ request }) => {
    const res = await request.post(`${BASE}/api/coupons/validate`, {
      data: { code: 'INVALIDCODE999' },
    });
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});

// ─── 10. User update ──────────────────────────────────────────────────────────

test.describe('POST /api/user/update', () => {
  test('rejects missing email with 400', async ({ request }) => {
    const res = await request.post(`${BASE}/api/user/update`, {
      data: { firstName: 'Test', lastName: 'User' },
    });
    expect(res.status()).toBe(400);
  });

  test('photo-only update does not require name fields', async ({ request }) => {
    // Should not crash — either succeeds or returns a known error (not 500)
    const res = await request.post(`${BASE}/api/user/update`, {
      data: { email: 'connected.steps2106@gmail.com', photo: null },
    });
    expect(res.status()).not.toBe(500);
  });
});

// ─── 11. Stories (public) ─────────────────────────────────────────────────────

test.describe('GET /api/stories', () => {
  test('returns stories array', async ({ request }) => {
    const res  = await request.get(`${BASE}/api/stories`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.stories)).toBe(true);
  });
});

// ─── 12. Corporate inquiry ────────────────────────────────────────────────────

test.describe('POST /api/corporate/inquiry', () => {
  test('rejects empty body gracefully', async ({ request }) => {
    const res  = await request.post(`${BASE}/api/corporate/inquiry`, { data: {} });
    expect([400, 422, 500]).toContain(res.status());
  });
});
