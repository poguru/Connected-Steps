process.env.ADMIN_PASSWORD = "test-admin-password";
process.env.COACH_TOKEN_SECRET = "test-secret";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";

jest.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: jest.fn(),
}));

import { deletePostWithCleanup } from "@/lib/delete-post";
import { DELETE } from "@/app/api/admin/posts/[id]/route";
import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";

const mockGetSupabaseServer = getSupabaseServer as jest.Mock;

const POST_ID = "post-uuid-001";
const PHOTO_KEY = "author_example_com_1234567890.jpg";
const PHOTO_URL = `https://project.supabase.co/storage/v1/object/public/user-posts/${PHOTO_KEY}`;

function makeAdminRequest(): NextRequest {
  return new NextRequest(
    new URL(`http://localhost/api/admin/posts/${POST_ID}`),
    { headers: { "x-admin-password": "test-admin-password" } }
  );
}

function makeUnauthRequest(): NextRequest {
  return new NextRequest(new URL(`http://localhost/api/admin/posts/${POST_ID}`));
}

function makeParams() {
  return { params: Promise.resolve({ id: POST_ID }) };
}

// Builds a minimal Supabase mock for deletePostWithCleanup.
// postRow: the row returned by select().single() on user_posts
// storageError: if set, storage.remove rejects with this
function makeDbMock(
  postRow: { id: string; photo_url: string | null } | null,
  storageError?: Error
) {
  const removeMock = storageError
    ? jest.fn().mockRejectedValue(storageError)
    : jest.fn().mockResolvedValue({ data: [{ name: PHOTO_KEY }], error: null });

  const storageMock = {
    from: jest.fn().mockReturnValue({ remove: removeMock }),
  };

  const deleteMock = jest.fn();

  // db.from("user_posts") is called twice:
  //   1st: .select(...).eq(...).single() — returns post row
  //   2nd: .delete().eq(...)             — delete the row
  let callCount = 0;
  const fromMock = jest.fn().mockImplementation(() => {
    callCount++;
    if (callCount === 1) {
      // Select chain
      const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
      chain.select = jest.fn().mockReturnValue(chain);
      chain.eq     = jest.fn().mockReturnValue(chain);
      chain.single = jest.fn().mockResolvedValue({ data: postRow, error: null });
      return chain;
    }
    // Delete chain
    const eqResolved = jest.fn().mockResolvedValue({ error: null });
    deleteMock.mockReturnValue({ eq: eqResolved });
    return { delete: deleteMock };
  });

  return {
    from:        fromMock,
    storage:     storageMock,
    _removeMock: removeMock,
    _deleteMock: deleteMock,
  };
}

beforeEach(() => jest.clearAllMocks());

// ── deletePostWithCleanup unit tests ──────────────────────────────────────────

describe("deletePostWithCleanup", () => {
  test("post with image — removes storage key and deletes row", async () => {
    const db = makeDbMock({ id: POST_ID, photo_url: PHOTO_URL });
    mockGetSupabaseServer.mockReturnValue(db);

    const result = await deletePostWithCleanup(POST_ID, db as never);

    expect(result.found).toBe(true);
    expect(db.storage.from).toHaveBeenCalledWith("user-posts");
    expect(db._removeMock).toHaveBeenCalledWith([PHOTO_KEY]);
    expect(db._deleteMock).toHaveBeenCalled();
  });

  test("post without image — skips storage, still deletes row", async () => {
    const db = makeDbMock({ id: POST_ID, photo_url: null });
    mockGetSupabaseServer.mockReturnValue(db);

    const result = await deletePostWithCleanup(POST_ID, db as never);

    expect(result.found).toBe(true);
    expect(db.storage.from).not.toHaveBeenCalled();
    expect(db._deleteMock).toHaveBeenCalled();
  });

  test("missing storage object — swallows error and still deletes row", async () => {
    const db = makeDbMock(
      { id: POST_ID, photo_url: PHOTO_URL },
      new Error("Object not found")
    );
    mockGetSupabaseServer.mockReturnValue(db);

    // Should not throw
    const result = await deletePostWithCleanup(POST_ID, db as never);

    expect(result.found).toBe(true);
    expect(db._removeMock).toHaveBeenCalled();
    expect(db._deleteMock).toHaveBeenCalled();
  });

  test("post not found — returns found: false, no storage or delete calls", async () => {
    const db = makeDbMock(null);
    mockGetSupabaseServer.mockReturnValue(db);

    const result = await deletePostWithCleanup(POST_ID, db as never);

    expect(result.found).toBe(false);
    expect(db.storage.from).not.toHaveBeenCalled();
    expect(db._deleteMock).not.toHaveBeenCalled();
  });
});

// ── Admin route tests ─────────────────────────────────────────────────────────

describe("DELETE /api/admin/posts/[id]", () => {
  test("returns 401 without admin password", async () => {
    const res = await DELETE(makeUnauthRequest(), makeParams());
    expect(res.status).toBe(401);
  });

  test("returns 404 when post does not exist", async () => {
    const db = makeDbMock(null);
    mockGetSupabaseServer.mockReturnValue(db);

    const res  = await DELETE(makeAdminRequest(), makeParams());
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBeTruthy();
  });

  test("admin can delete post with image — storage is cleaned up", async () => {
    const db = makeDbMock({ id: POST_ID, photo_url: PHOTO_URL });
    mockGetSupabaseServer.mockReturnValue(db);

    const res  = await DELETE(makeAdminRequest(), makeParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(db._removeMock).toHaveBeenCalledWith([PHOTO_KEY]);
  });

  test("admin can delete post without image", async () => {
    const db = makeDbMock({ id: POST_ID, photo_url: null });
    mockGetSupabaseServer.mockReturnValue(db);

    const res  = await DELETE(makeAdminRequest(), makeParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(db.storage.from).not.toHaveBeenCalled();
  });
});
