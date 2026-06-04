"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { PlayCircle, Trophy, Building2, Bike, Flame, Heart, ChevronRight } from "lucide-react";

const programs = [
  { icon: PlayCircle, title: "Beginner 5K",       desc: "Couch to 5K in 8 weeks. Build a habit that sticks.",               color: "from-sky-500 to-cyan-500",     tag: "Start here" },
  { icon: Trophy,     title: "Marathon Training",  desc: "Race-day-ready plans for half and full marathons.",                color: "from-orange-500 to-rose-500",  tag: "Popular"    },
  { icon: Building2,  title: "Corporate Fitness",  desc: "Wellness programs and team challenges for companies.",              color: "from-blue-600 to-indigo-600",  tag: "Teams"      },
  { icon: Bike,       title: "10K Programme",      desc: "Push past the 5K. Build speed and race-day confidence.",           color: "from-emerald-500 to-teal-500", tag: "New"        },
  { icon: Flame,      title: "Fitness Challenges", desc: "30-day streaks, distance goals, and group accountability.",        color: "from-amber-500 to-orange-500", tag: "Fun"        },
  { icon: Heart,      title: "Weight Loss",        desc: "Sustainable, run-based fat loss with coach support.",              color: "from-pink-500 to-fuchsia-500", tag: "Coached"    },
];

export default function TrainingPlans() {
  const router = useRouter();

  const handleLearnMore = () => {
    const user = typeof window !== "undefined" ? localStorage.getItem("cs_user") : null;
    router.push(user ? "/dashboard" : "/running-club-hyderabad");
  };

  return (
    <section id="training" style={{ maxWidth: 1280, margin: "0 auto", padding: "5rem 1.5rem" }}>
      {/* Heading */}
      <div style={{ textAlign: "center", marginBottom: "3.5rem" }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--primary)", marginBottom: "0.75rem" }}>
          Our Programs
        </div>
        <h2 className="font-display" style={{ fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 700, letterSpacing: "-0.015em", color: "var(--foreground)" }}>
          Find your <span className="text-gradient-accent">program</span>.
        </h2>
        <p style={{ marginTop: "1rem", fontSize: "1rem", color: "var(--muted-foreground)", maxWidth: 480, margin: "1rem auto 0" }}>
          From your first kilometre to your tenth marathon — we've got a plan and a coach who's done it.
        </p>
      </div>

      {/* Grid */}
      <div style={{ display: "grid", gap: "1.25rem" }} className="sm:grid-cols-2 lg:grid-cols-3">
        {programs.map((p, i) => (
          <motion.div
            key={p.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: i * 0.07 }}
            style={{ position: "relative", overflow: "hidden", borderRadius: 16, border: "1px solid var(--border)", background: "var(--surface)", padding: "1.5rem", boxShadow: "var(--shadow-md)", transition: "transform 0.2s, box-shadow 0.2s", cursor: "pointer" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-6px)"; (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-lg)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ""; (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-md)"; }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1.25rem" }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, display: "grid", placeItems: "center", background: `linear-gradient(135deg, var(--tw-gradient-stops, oklch(0.72 0.19 49), oklch(0.66 0.22 30)))`, color: "#fff", boxShadow: "var(--shadow-md)" }}
                className={`bg-gradient-to-br ${p.color}`}>
                <p.icon size={20} />
              </div>
              <span style={{ borderRadius: 999, background: "oklch(0.74 0.2 50 / 10%)", padding: "2px 10px", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--accent)" }}>
                {p.tag}
              </span>
            </div>
            <h3 className="font-display" style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--foreground)", marginBottom: "0.5rem" }}>{p.title}</h3>
            <p style={{ fontSize: "0.875rem", color: "var(--muted-foreground)", lineHeight: 1.6, marginBottom: "1.25rem" }}>{p.desc}</p>
            <button onClick={handleLearnMore} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.875rem", fontWeight: 600, color: "var(--primary)", background: "none", border: "none", cursor: "pointer", padding: 0, transition: "gap 0.2s", fontFamily: "var(--font-body)" }}>
              Learn more <ChevronRight size={14} />
            </button>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
