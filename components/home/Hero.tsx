import Image from "next/image";

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center noise" style={{ background: "var(--cs-black)" }}>
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(232,98,10,0.1) 0%, transparent 70%)" }} />
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: "linear-gradient(var(--cs-white) 1px, transparent 1px), linear-gradient(90deg, var(--cs-white) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
        }} />

      <div className="container relative z-10" style={{ paddingTop: "8rem", paddingBottom: "5rem" }}>
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <div className="section-label animate-fade-up">Connected Steps</div>
            <h1 className="font-display animate-fade-up-1 mb-6"
              style={{ fontSize: "clamp(2rem, 7vw, 5.5rem)", fontWeight: 300, color: "var(--cs-white)", lineHeight: 1.1 }}>
              Every step,{" "}
              <em className="not-italic" style={{ color: "var(--cs-orange)" }}>a plan</em>
              <br />behind it.
            </h1>
            <p className="text-base leading-relaxed mb-6 max-w-md animate-fade-up-2"
              style={{ color: "var(--cs-muted)", fontSize: "1.05rem" }}>
              Connected Steps pairs you with elite coaches and a training community that keeps you
              accountable — from your first kilometre to your finish-line moment.
            </p>
            <p className="text-base leading-relaxed max-w-md animate-fade-up-2"
              style={{ color: "var(--cs-muted)", fontSize: "0.95rem", borderLeft: "3px solid var(--cs-orange)", paddingLeft: "1rem" }}>
              We are a Hyderabad-based running club founded on one belief: every runner deserves a
              real coach, a real plan, and a community that shows up. Whether you&rsquo;re lacing up
              for the first time or chasing a marathon PB — Connected Steps is built for you.
            </p>
          </div>

          <div className="hidden lg:flex items-center justify-center">
            <div className="relative animate-float">
              <div className="absolute inset-0 rounded-full"
                style={{ border: "1px solid rgba(245,200,66,0.15)", transform: "scale(1.25)" }} />
              <div className="absolute inset-0 rounded-full"
                style={{ border: "1px solid rgba(232,98,10,0.1)", transform: "scale(1.5)" }} />
              <div className="relative w-72 h-72 rounded-full flex items-center justify-center"
                style={{ background: "var(--cs-charcoal)", border: "1px solid rgba(232,98,10,0.2)" }}>
                <Image src="/logo.png" alt="Connected Steps" width={220} height={220} className="rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
