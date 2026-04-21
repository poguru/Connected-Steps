# Connected Steps — Home / Landing Page

Premium luxury running training landing page built with Next.js 14, TypeScript, and Tailwind CSS.

---

## Design system

| Token          | Value         | Usage                    |
|----------------|---------------|--------------------------|
| Forest black   | `#0a0f0d`     | Page background          |
| Deep forest    | `#0e1a13`     | Section backgrounds      |
| Charcoal       | `#1c2620`     | Cards, panels            |
| Emerald green  | `#1d9e75`     | Primary accent, CTAs     |
| Gold           | `#c9a96e`     | Section labels, borders  |
| Cream          | `#f5f2ed`     | Headings, body text      |
| Muted          | `#8a9990`     | Secondary text           |

**Fonts**: Cormorant Garamond (display headings) + DM Sans (body, UI)

---

## Pages & sections

```
app/page.tsx  ← Home page
  ├── Navbar              (fixed, scroll-aware, mobile responsive)
  ├── Hero                (full-screen, logo badge, social proof)
  ├── MarqueeBanner       (scrolling green ticker)
  ├── TrainingPlans       (5K / Half / Full marathon cards)
  ├── Features            (6 feature cards, sticky heading layout)
  ├── StatsAndTestimonials (impact numbers + runner quotes)
  ├── CallToAction        (final conversion section)
  └── Footer              (links, social, legal)
```

---

## File structure

```
connected-steps/
├── app/
│   ├── page.tsx           ← Home page (this)
│   ├── layout.tsx         ← Root layout + Cormorant + DM Sans
│   └── globals.css        ← Design tokens + all custom CSS
├── components/
│   ├── layout/
│   │   ├── Navbar.tsx
│   │   └── Footer.tsx
│   └── home/
│       ├── Hero.tsx
│       ├── MarqueeBanner.tsx
│       ├── TrainingPlans.tsx
│       ├── Features.tsx
│       ├── StatsAndTestimonials.tsx
│       └── CallToAction.tsx
├── public/
│   └── logo.png           ← Connected Steps logo (place here)
└── tailwind.config.ts
```

---

## Setup

```bash
# 1. In your existing Next.js project, merge these files in
# 2. Install fonts (already handled via next/font/google)
# 3. Place logo.png in /public/logo.png
# 4. Run dev server
npm run dev
```

Visit `http://localhost:3000` to see the home page.

---

## Vercel deployment

```bash
git add .
git commit -m "Add Connected Steps home page"
git push
```

Vercel auto-detects Next.js and deploys automatically on every push.

---

## Customise

- **Stats** → `StatsAndTestimonials.tsx` — update the numbers
- **Testimonials** → `StatsAndTestimonials.tsx` — add real runner quotes
- **Training plans** → `TrainingPlans.tsx` — adjust durations and features
- **Nav links** → `Navbar.tsx` — add/remove pages
- **Colors** → `globals.css` `:root` block — all tokens in one place

---

## Next pages to build
- `/auth` — Sign up / Login (already built)
- `/onboarding` — Post sign-up flow
- `/dashboard` — Training dashboard
- `/achievements` — Badges and milestones
- `/coach` — Coach portal
- `/pricing` — Pricing plans
