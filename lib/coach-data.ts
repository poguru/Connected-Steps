export interface CoachTestimonial {
  name:  string;
  goal:  string;
  quote: string;
}

export interface CoachProfile {
  slug:           string;
  name:           string;
  role:           string;
  location:       string;
  email:          string;   // from DB — used for rating lookup
  photo:          string | null;
  initials:       string;
  bio:            string;
  qualifications: { icon: string; text: string }[];
  certifications: string[];
  medals:         { icon: string; text: string }[];
  instagram?:     string;
  testimonials:   CoachTestimonial[];
  sessionsCoached: number;   // approximate
}

export const COACHES: CoachProfile[] = [
  {
    slug:     "ashokan-k",
    name:     "Ashokan K",
    role:     "Head Athletics & Conditioning Coach",
    location: "Secunderabad",
    email:    "ashokan@connectedsteps.in",
    photo:    "/coaches/ashokan-k.jpg",
    initials: "AK",
    bio:      "Former Army athlete turned elite coach with over 25 years of experience. NIS Patiala certified, National Gold Medallist (1999) and three-time Services Gold Medallist. Has coached CWG Bronze medallist Harminder Singh and multiple national-level athletes across Andhra Pradesh, Tamil Nadu, Karnataka and Kerala.",
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
    sessionsCoached: 200,
    testimonials: [
      {
        name:  "Rajesh M.",
        goal:  "Completed first half-marathon",
        quote: "Coach Ashokan's military discipline and technical depth transformed my running form completely. From a casual jogger to a half-marathon finisher in 12 weeks.",
      },
      {
        name:  "Priya S.",
        goal:  "Sub-60 minute 10K",
        quote: "His conditioning drills are tough but they work. I hit my 10K goal two months ahead of schedule. The attention to detail is unmatched.",
      },
      {
        name:  "Vikram R.",
        goal:  "Injury recovery & return to running",
        quote: "After a knee injury, I was afraid to run again. Coach Ashokan rebuilt my strength from the ground up. Now I'm training for a full marathon.",
      },
    ],
  },
  {
    slug:     "durga-rao-vana",
    name:     "Durga Rao Vana",
    role:     "Marathon Coach & Personal Trainer",
    location: "Hyderabad",
    email:    "durga@connectedsteps.in",
    photo:    "/coaches/durga.png",
    initials: "DV",
    bio:      "Professional athlete and certified marathon coach with 4 years of experience. Certified by Netaji Subash NIS Bangalore and trained at Sports Authority of India (SAI) Gachibowli. Currently coaching at Connected Steps and TCS Hyderabad. National Games 2022 participant in 1600m at Gujarat.",
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
    instagram:  "@trainer_durga",
    sessionsCoached: 150,
    testimonials: [
      {
        name:  "Karthik N.",
        goal:  "First marathon sub-5 hours",
        quote: "Durga's marathon-specific plans are detailed yet flexible. He adjusted my training when work got busy without losing the overall goal. Crossed the finish line with energy to spare.",
      },
      {
        name:  "Ananya T.",
        goal:  "Lost 6kg and ran her first 10K",
        quote: "As someone who had never run before, I was nervous. Durga started me slow and built me up week by week. Three months later I ran a 10K — I still can't believe it.",
      },
      {
        name:  "Suresh P.",
        goal:  "Improved marathon PB by 28 minutes",
        quote: "The strength work Durga built into my plan made the difference in the final 10km. Best improvement I've seen in 5 years of running.",
      },
    ],
  },
  {
    slug:     "achyuta-kumari-kolli",
    name:     "Achyuta Kumari Kolli",
    role:     "Sprint & Strength Coach",
    location: "Hyderabad",
    email:    "achyuta@connectedsteps.in",
    photo:    "/coaches/acthutha.jpg",
    initials: "AK",
    bio:      "National medalist and professional athlete with a PG Diploma in Strength & Conditioning from Indira Gandhi University. Represented Telangana and Andhra Pradesh in 100m and Long Jump at national level. Currently coaching at TCS Striders Miles and Skechers Running Club.",
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
    sessionsCoached: 120,
    testimonials: [
      {
        name:  "Meena K.",
        goal:  "Faster 5K time",
        quote: "Achyuta's sprint drills changed how I run entirely. I shaved 3 minutes off my 5K in 8 weeks. Her own athletic background means she knows exactly what to fix.",
      },
      {
        name:  "Aditya V.",
        goal:  "Injury-free season",
        quote: "Her strength programming is surgical — she pinpointed exactly which muscle weaknesses were causing my recurring calf strain. Pain-free for 6 months now.",
      },
      {
        name:  "Lakshmi R.",
        goal:  "Speed improvement at 40",
        quote: "I didn't think I could get faster at 40. Achyuta proved me completely wrong. Her energy and belief in every athlete is contagious.",
      },
    ],
  },
];

export function getCoachBySlug(slug: string): CoachProfile | undefined {
  return COACHES.find(c => c.slug === slug);
}
