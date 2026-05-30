import Link from "next/link";
import Image from "next/image";

export const metadata = {
  title: "Blog – Connected Steps",
  description: "Running tips, training guides, and community stories from the Connected Steps coaches.",
};

const POSTS = [
  {
    slug:     "how-to-build-your-first-running-plan",
    title:    "How to Build Your First Running Plan",
    excerpt:  "Starting from zero? Our coaches break down the exact steps to go from couch to your first 5K without burning out in week two.",
    category: "Training",
    date:     "12 May 2026",
    readTime: "5 min read",
  },
  {
    slug:     "the-science-of-running-cadence",
    title:    "The Science of Running Cadence",
    excerpt:  "Most recreational runners take fewer steps per minute than they should. Here's what cadence is, why it matters, and how to improve it in four weeks.",
    category: "Technique",
    date:     "5 May 2026",
    readTime: "7 min read",
  },
  {
    slug:     "nutrition-for-long-runs",
    title:    "Nutrition for Long Runs: What to Eat and When",
    excerpt:  "Fuelling a long run is not the same as fuelling a short one. We cover pre-run meals, on-the-run energy, and recovery nutrition in plain language.",
    category: "Nutrition",
    date:     "28 Apr 2026",
    readTime: "6 min read",
  },
  {
    slug:     "how-we-design-personalised-training-plans",
    title:    "How We Design Personalised Training Plans",
    excerpt:  "Every runner is different. Our coaches explain the variables they look at — pace, history, goal, lifestyle — before writing a single session.",
    category: "Coaching",
    date:     "20 Apr 2026",
    readTime: "4 min read",
  },
  {
    slug:     "rest-days-are-not-optional",
    title:    "Rest Days Are Not Optional — Here's Why",
    excerpt:  "Skipping rest days feels productive. It isn't. We explain what actually happens to your muscles during recovery and how to use rest days well.",
    category: "Recovery",
    date:     "14 Apr 2026",
    readTime: "5 min read",
  },
  {
    slug:     "running-in-hyderabad-heat",
    title:    "Running in Hyderabad Heat: a Practical Guide",
    excerpt:  "Summer in Hyderabad is brutal. Our local coaches share timing, hydration, and pacing strategies that keep you training safely through the hot months.",
    category: "Local",
    date:     "7 Apr 2026",
    readTime: "6 min read",
  },
];

const CATEGORY_COLORS: Record<string, string> = {
  Training:  "rgba(232,98,10,0.15)",
  Technique: "rgba(99,179,237,0.12)",
  Nutrition: "rgba(72,187,120,0.12)",
  Coaching:  "rgba(246,173,85,0.12)",
  Recovery:  "rgba(159,122,234,0.12)",
  Local:     "rgba(237,137,54,0.12)",
};

const CATEGORY_TEXT: Record<string, string> = {
  Training:  "var(--cs-orange)",
  Technique: "#63b3ed",
  Nutrition: "#48bb78",
  Coaching:  "#f6ad55",
  Recovery:  "#9f7aea",
  Local:     "#ed8936",
};

export default function BlogPage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--cs-black)", color: "var(--cs-white)" }}>
      {/* Nav */}
      <header style={{ background: "var(--cs-dark)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "1rem 2rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.6rem", textDecoration: "none" }}>
          <Image src="/logo.png" alt="Connected Steps" width={36} height={36} className="rounded-full" />
          <span style={{ fontSize: "1rem", fontWeight: 600, color: "var(--cs-white)" }}>Connected Steps</span>
        </Link>
        <Link href="/" style={{ fontSize: "0.8rem", color: "var(--cs-muted)", textDecoration: "none" }}>← Back to home</Link>
      </header>

      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "4rem 2rem 5rem" }}>
        {/* Header */}
        <div style={{ marginBottom: "3rem" }}>
          <p style={{ fontSize: "11px", color: "var(--cs-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.5rem" }}>Connected Steps</p>
          <h1 style={{ fontSize: "2.2rem", fontWeight: 300, color: "var(--cs-white)", marginBottom: "0.75rem" }}>Blog</h1>
          <p style={{ fontSize: "0.9rem", color: "var(--cs-muted)", lineHeight: 1.7, maxWidth: "520px" }}>
            Training tips, coaching insight, nutrition guides, and stories from our running community — written by our coaches.
          </p>
        </div>

        {/* Coming soon notice */}
        <div style={{ background: "rgba(232,98,10,0.07)", border: "1px solid rgba(232,98,10,0.2)", borderRadius: "8px", padding: "1rem 1.25rem", marginBottom: "3rem", fontSize: "0.82rem", color: "var(--cs-muted)", display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <span style={{ color: "var(--cs-orange)", fontWeight: 600 }}>Coming soon</span>
          — full articles launching shortly. Follow us on{" "}
          <a href="https://www.instagram.com/connected_steps/" target="_blank" rel="noopener noreferrer" style={{ color: "var(--cs-orange)", textDecoration: "none" }}>Instagram</a>
          {" "}for content in the meantime.
        </div>

        {/* Post grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 380px), 1fr))", gap: "1.25rem" }}>
          {POSTS.map((post) => (
            <article
              key={post.slug}
              style={{
                background:   "var(--cs-dark)",
                border:       "1px solid rgba(255,255,255,0.06)",
                borderRadius: "10px",
                padding:      "1.5rem",
                display:      "flex",
                flexDirection:"column",
                gap:          "0.75rem",
                cursor:       "default",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                <span style={{
                  fontSize:        "10px",
                  fontWeight:      700,
                  letterSpacing:   "0.1em",
                  textTransform:   "uppercase",
                  background:      CATEGORY_COLORS[post.category] ?? "rgba(255,255,255,0.06)",
                  color:           CATEGORY_TEXT[post.category]   ?? "var(--cs-muted)",
                  padding:         "3px 10px",
                  borderRadius:    "20px",
                }}>
                  {post.category}
                </span>
                <span style={{ fontSize: "11px", color: "var(--cs-muted)" }}>{post.readTime}</span>
              </div>

              <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--cs-white)", lineHeight: 1.4, margin: 0 }}>
                {post.title}
              </h2>

              <p style={{ fontSize: "0.82rem", color: "var(--cs-muted)", lineHeight: 1.7, margin: 0, flex: 1 }}>
                {post.excerpt}
              </p>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "0.25rem" }}>
                <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)" }}>{post.date}</span>
                <span style={{ fontSize: "11px", color: "rgba(232,98,10,0.5)", fontWeight: 600 }}>Coming soon</span>
              </div>
            </article>
          ))}
        </div>

        {/* Follow CTA */}
        <div style={{ marginTop: "4rem", textAlign: "center", padding: "2.5rem", background: "var(--cs-dark)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "10px" }}>
          <div style={{ fontSize: "1.4rem", marginBottom: "0.75rem" }}>📖</div>
          <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--cs-white)", marginBottom: "0.4rem" }}>More content on the way</div>
          <p style={{ fontSize: "0.82rem", color: "var(--cs-muted)", marginBottom: "1.25rem", maxWidth: "380px", margin: "0 auto 1.25rem" }}>
            Our coaches are writing practical guides for runners of every level. Follow us for updates.
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: "1rem", flexWrap: "wrap" }}>
            <a href="https://www.instagram.com/connected_steps/" target="_blank" rel="noopener noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "var(--cs-orange)", color: "#fff", textDecoration: "none", padding: "10px 20px", borderRadius: "6px", fontSize: "0.82rem", fontWeight: 700 }}>
              Follow on Instagram
            </a>
            <a href="https://www.youtube.com/@ConnectedSteps" target="_blank" rel="noopener noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", border: "1px solid rgba(255,255,255,0.15)", color: "var(--cs-muted)", textDecoration: "none", padding: "10px 20px", borderRadius: "6px", fontSize: "0.82rem", fontWeight: 600 }}>
              Subscribe on YouTube
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
