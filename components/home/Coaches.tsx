"use client";

const coaches = [
  {
    name: "Ashokan K",
    role: "Head Athletics & Conditioning Coach",
    location: "Secunderabad",
    bio: "Former Army athlete turned elite coach with over 25 years of experience. NIS Patiala certified, National Gold Medallist (1999) and three-time Services Gold Medallist. Has coached CWG Bronze medallist Harminder Singh and multiple national-level athletes across Andhra Pradesh, Tamil Nadu, Karnataka and Kerala.",
    qualifications: [
      { icon: "🎓", text: "NIS Diploma – National Institute of Sports, Patiala (2007–08)" },
      { icon: "🎓", text: "Bachelor of Arts (BA), Hyderabad" },
    ],
    certifications: [
      "Athletics & Conditioning Coach – AOC Centre, Army Ordnance Corps",
      "Coached state teams in AP, Tamil Nadu, Karnataka & Kerala",
      "South Command, Army Green & Army Node teams coach",
    ],
    medals: [
      { icon: "🥇", text: "National Gold Medallist 1999" },
      { icon: "🥇", text: "Services Gold Medallist 1998, 1999 & 2000" },
      { icon: "🏅", text: "Coached CWG Bronze medallist Harminder Singh (20km Race Walk, 2010)" },
    ],
    initials: "AK",
    photo: null as string | null,
    imageRight: false,
  },
  {
    name: "Vana Durga Rao",
    role: "Marathon Coach & Personal Trainer",
    location: "Hyderabad",
    bio: "Professional athlete and certified marathon coach with 4 years of experience. Certified by Netaji Subash NIS Bangalore and trained at Sports Authority of India (SAI) Gachibowli. Currently coaching at Connected Steps and TCS Hyderabad. National Games 2022 participant in 1600m at Gujarat.",
    qualifications: [
      { icon: "🎓", text: "Diploma in Strength & Conditioning" },
      { icon: "🎓", text: "Certified Coach – Netaji Subash National Institute of Sports, Bangalore" },
      { icon: "🎓", text: "Trained at Sports Authority of India (SAI), Gachibowli" },
      { icon: "🎓", text: "Trained at Telangana State Sports School, Medchal" },
    ],
    certifications: [
      "Marathon Coach – Connected Steps",
      "Personal Trainer – Tata Consultancy Services (TCS), Hyderabad",
      "Coach – Go Alpha Kids",
      "Specialist in Cricket Strength & Conditioning",
    ],
    medals: [
      { icon: "🥇", text: "South Zone Gold – 600m (2017)" },
      { icon: "🥉", text: "Youth Nationals Bronze – Medley Relay (2019)" },
      { icon: "🏅", text: "National Games 2022 Participant – 1600m, Gujarat" },
    ],
    initials: "VD",
    photo: null as string | null,
    imageRight: true,
    instagram: "@trainer_durga",
  },
  {
    name: "Kolli Achyuta Kumari",
    role: "Sprint & Strength Coach",
    location: "Hyderabad",
    bio: "National medalist and professional athlete with a PG Diploma in Strength & Conditioning from Indira Gandhi University. Represented Telangana and Andhra Pradesh in 100m and Long Jump at national level. Currently coaching at TCS Striders Miles and Skechers Running Club.",
    qualifications: [
      { icon: "🎓", text: "PG Diploma – Strength & Conditioning, Sports Coaching (Indira Gandhi University, 2020)" },
      { icon: "🎓", text: "Bachelor of Arts – Osmania University (2014)" },
      { icon: "🎓", text: "Bachelor of Physical Education – Currently Pursuing (Siddharth Engineering College)" },
    ],
    certifications: [
      "Coach – TCS Striders Miles (Feb 2025 – Present)",
      "Strength & Conditioning Coach – Skechers Running Club (Aug 2025 – Present)",
      "Athletic Coach – Delhi Public School, Miyapur (2022–2023)",
      "Fitness Coach – Tightened Global Multi Sports Academy (2021–2022)",
    ],
    medals: [
      { icon: "🥇", text: "8 Gold Medals – National Athletics Championships" },
      { icon: "🥈", text: "4 Silver Medals – National Athletics Championships" },
      { icon: "🥉", text: "5 Bronze Medals – National Athletics Championships" },
    ],
    initials: "KA",
    photo: null as string | null,
    imageRight: false,
  },
];

export default function Coaches() {
  return (
    <section id="coaches" className="section" style={{ background: "var(--cs-black)" }}>
      <div className="container">

        {/* Header */}
        <div className="text-center mb-16">
          <span className="gold-line mx-auto" />
          <div className="section-label">Meet the coaches</div>
          <h2 className="font-display mt-2"
            style={{ fontSize: "clamp(2.2rem, 4vw, 3.5rem)", fontWeight: 300, color: "var(--cs-white)" }}>
            Trained by champions.
            <br /><em className="not-italic" style={{ color: "var(--cs-orange)" }}>Coached by the best.</em>
          </h2>
          <p style={{ marginTop: "1rem", fontSize: "0.95rem", color: "var(--cs-muted)", maxWidth: "520px", margin: "1rem auto 0" }}>
            Our coaches are national-level athletes and certified professionals who've competed and won at the highest levels.
          </p>
        </div>

        {/* Coach rows — alternating layout */}
        <div style={{ display: "flex", flexDirection: "column", gap: "5rem" }}>
          {coaches.map((coach) => (
            <div
              key={coach.name}
              className="coach-row"
              style={{
                display: "flex",
                flexDirection: coach.imageRight ? "row-reverse" : "row",
                alignItems: "center",
                gap: "4rem",
              }}
            >
              {/* Photo / Avatar */}
              <div className="coach-photo-wrap" style={{ flex: "0 0 auto", display: "flex", justifyContent: "center" }}>
                {coach.photo ? (
                  <img
                    src={coach.photo}
                    alt={coach.name}
                    className="coach-photo-img"
                    style={{ width: "280px", height: "340px", objectFit: "cover", borderRadius: "8px", border: "2px solid rgba(232,98,10,0.3)" }}
                  />
                ) : (
                  <div className="coach-photo-img" style={{
                    width: "280px", height: "340px", borderRadius: "8px",
                    background: "var(--cs-dark)", border: "2px dashed rgba(232,98,10,0.25)",
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem",
                  }}>
                    <div style={{
                      width: "100px", height: "100px", borderRadius: "50%",
                      background: "var(--cs-orange)", display: "flex", alignItems: "center",
                      justifyContent: "center", fontSize: "2rem", fontWeight: 700, color: "var(--cs-white)",
                    }}>
                      {coach.initials}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--cs-muted)", textAlign: "center", padding: "0 1rem" }}>
                      Photo coming soon
                    </div>
                  </div>
                )}
              </div>

              {/* Details */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Name & role */}
                <div style={{ fontSize: "11px", color: "var(--cs-orange)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "0.5rem" }}>
                  {coach.role}
                </div>
                <h3 className="font-display" style={{ fontSize: "clamp(1.8rem, 3vw, 2.5rem)", fontWeight: 300, color: "var(--cs-white)", marginBottom: "0.4rem" }}>
                  {coach.name}
                </h3>
                <div style={{ fontSize: "0.8rem", color: "var(--cs-muted)", marginBottom: "1.25rem" }}>📍 {coach.location}</div>

                {/* Bio */}
                <p style={{ fontSize: "0.9rem", color: "var(--cs-muted)", lineHeight: 1.8, marginBottom: "1.5rem" }}>
                  {coach.bio}
                </p>

                {/* Qualifications */}
                <div style={{ marginBottom: "1.25rem" }}>
                  <div style={{ fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--cs-orange)", marginBottom: "0.6rem", fontWeight: 600 }}>
                    Qualifications
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    {coach.qualifications.map((q) => (
                      <div key={q.text} style={{ display: "flex", alignItems: "flex-start", gap: "0.6rem", fontSize: "0.825rem", color: "var(--cs-white)" }}>
                        <span style={{ flexShrink: 0 }}>{q.icon}</span>
                        {q.text}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Certifications / Experience */}
                <div style={{ marginBottom: "1.25rem" }}>
                  <div style={{ fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--cs-orange)", marginBottom: "0.6rem", fontWeight: 600 }}>
                    Experience
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    {coach.certifications.map((c) => (
                      <div key={c} style={{ display: "flex", alignItems: "flex-start", gap: "0.6rem", fontSize: "0.825rem", color: "var(--cs-muted)" }}>
                        <span style={{ color: "var(--cs-orange)", flexShrink: 0, marginTop: "2px" }}>›</span>
                        {c}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Medals */}
                <div style={{ background: "rgba(232,98,10,0.06)", border: "1px solid rgba(232,98,10,0.15)", borderRadius: "6px", padding: "0.875rem 1rem", marginBottom: "1rem" }}>
                  <div style={{ fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--cs-orange)", marginBottom: "0.6rem", fontWeight: 600 }}>
                    Achievements
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    {coach.medals.map((m) => (
                      <div key={m.text} style={{ display: "flex", alignItems: "flex-start", gap: "0.6rem", fontSize: "0.825rem", color: "var(--cs-white)" }}>
                        <span style={{ flexShrink: 0 }}>{m.icon}</span>
                        {m.text}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Instagram */}
                {coach.instagram && (
                  <div style={{ fontSize: "0.8rem", color: "var(--cs-muted)" }}>
                    Instagram: <span style={{ color: "var(--cs-orange)" }}>{coach.instagram}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
