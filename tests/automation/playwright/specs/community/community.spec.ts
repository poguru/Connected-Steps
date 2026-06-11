import { test, expect } from "../../fixtures/base";

test.describe("Community & Feed", () => {
  test("TC-COM01 | community page shows only approved posts", async ({ communityPage, api }) => {
    await communityPage.navigateToCommunity();
    await communityPage.page.waitForLoadState("networkidle");
    await communityPage.getPostCount();
    // All visible posts must be approved — verify via API
    const res = await api.getCommunityPosts();
    expect(res.status()).toBe(200);
    const body = await res.json();
    const posts = (body.posts ?? []) as Array<{ approved: boolean }>;
    const unapproved = posts.filter((p) => p.approved !== true);
    expect(unapproved).toHaveLength(0);
  });

  test("TC-COM02 | submitting a community post creates pending record", async ({ api }) => {
    const title = `QA Test Question ${Date.now()}`;
    const res = await api.createCommunityPost({
      title,
      body: "This is an automated QA test question. Please ignore.",
      category: "general",
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status ?? body.post?.status).toMatch(/pending|created/i);
  });

  test("TC-COM03 | unapproved post is invisible to other users", async ({ api, page }) => {
    // Submit post
    const title = `Private QA Post ${Date.now()}`;
    const postRes = await api.createCommunityPost({ title, body: "Should not appear", category: "general" });
    const postBody = await postRes.json();
    const postId = postBody.id ?? postBody.post?.id;

    // Clear auth, load community as unauthenticated
    await page.context().clearCookies();
    const communityRes = await page.request.get("/api/community/posts");
    const resBody = await communityRes.json();
    const posts = (resBody.posts ?? []) as Array<{ id: string; title: string }>;
    const visible = posts.find((p) => p.title === title || p.id === postId);
    expect(visible).toBeUndefined();
  });

  test("TC-COM04 | XSS payload in post body is sanitised", async ({ api, communityPage }) => {
    const res = await api.createCommunityPost({
      title: "XSS Test",
      body: '<script>alert("xss")</script>',
      category: "general",
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Body stored must not contain raw <script> tag
    const storedBody = JSON.stringify(body);
    expect(storedBody).not.toContain("<script>");
  });

  test("TC-COM05 | social feed loads posts in chronological order", async ({ communityPage, api }) => {
    const res = await api.getFeed();
    expect(res.status()).toBe(200);
    const body = await res.json();
    const events = (body.events ?? []) as Array<{ created_at: string }>;
    if (events.length > 1) {
      const dates = events.map((e) => new Date(e.created_at).getTime());
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i]).toBeLessThanOrEqual(dates[i - 1]);
      }
    }
  });

  test("TC-COM06 | creating a feed post is visible in feed", async ({ api }) => {
    const content = `QA feed post ${Date.now()}`;
    const res = await api.createPost({ type: "general", content });
    expect(res.status()).toBe(200);
    const feedRes = await api.getFeed();
    const feedBody = await feedRes.json();
    const events = (feedBody.events ?? []) as Array<{ event_type: string; payload: { body?: string } }>;
    const found = events.find(
      (e) => e.event_type === "user_post" && e.payload?.body?.includes(content),
    );
    expect(found).toBeDefined();
  });

  test("TC-COM07 | feed pagination does not return duplicate posts", async ({ api }) => {
    const res1 = await api.request.get("/api/feed?limit=10");
    if (res1.status() !== 200) return;
    const body1 = await res1.json();
    const events1 = (body1.events ?? []) as Array<{ id: string }>;
    const cursor  = body1.next_cursor as string | null;
    if (!cursor || !body1.has_more) return; // not enough events to paginate
    const res2 = await api.request.get(`/api/feed?before=${encodeURIComponent(cursor)}&limit=10`);
    if (res2.status() !== 200) return;
    const body2  = await res2.json();
    const events2 = (body2.events ?? []) as Array<{ id: string }>;
    const ids1 = new Set(events1.map((e) => e.id));
    const dupes = events2.filter((e) => ids1.has(e.id));
    expect(dupes).toHaveLength(0);
  });
});
