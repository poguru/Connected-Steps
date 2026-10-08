# How to Add Sponsors to IT Run Sprint-2 Registration

## Quick Setup (No Code Changes Required!)

### Step 1: Save Sponsor Logos

Place sponsor logo files in:
```
/public/events/it-run-sprint-2/sponsors/
```

**Supported formats**: PNG, JPG, WebP  
**Recommended**: Transparent PNG for best appearance

### Step 2: Update Sponsor Config

Edit `app/it-run/components/EventBranding.tsx` (around line 195):

Find this section:
```typescript
const sponsorConfig: SponsorConfig[] = [
  // Example config (uncomment and update when adding sponsors):
  // {
  //   tier: "title",
  //   logos: [
  //     { filename: "title-sponsor-1.png", name: "Sponsor Name", url: "https://sponsor.com" }
  //   ]
  // },
  ...
];
```

Add your sponsors like this:

### Step 3: Save & Deploy

That's it! No other code changes needed.

---

## Examples

### Example 1: Add a Title Sponsor

```typescript
const sponsorConfig: SponsorConfig[] = [
  {
    tier: "title",
    logos: [
      { 
        filename: "acme-corp.png", 
        name: "ACME Corporation", 
        url: "https://acme.com" 
      }
    ]
  }
];
```

### Example 2: Add Multiple Sponsors

```typescript
const sponsorConfig: SponsorConfig[] = [
  {
    tier: "title",
    logos: [
      { 
        filename: "title-sponsor-1.png", 
        name: "Title Sponsor", 
        url: "https://titlesponsor.com" 
      }
    ]
  },
  {
    tier: "associate",
    logos: [
      { filename: "associate-1.png", name: "Associate 1" },
      { filename: "associate-2.png", name: "Associate 2" },
      { filename: "associate-3.png", name: "Associate 3" }
    ]
  },
  {
    tier: "supporting",
    logos: [
      { filename: "supporter-1.png", name: "Supporter 1" }
    ]
  }
];
```

### Example 3: Add Category-Specific Partners

```typescript
const sponsorConfig: SponsorConfig[] = [
  {
    tier: "hydration",
    logos: [
      { filename: "water-brand.png", name: "Water Partner" }
    ]
  },
  {
    tier: "tshirt",
    logos: [
      { filename: "apparel-brand.png", name: "Apparel Partner" }
    ]
  },
  {
    tier: "timing",
    logos: [
      { filename: "timing-device.png", name: "Timing Partner" }
    ]
  }
];
```

---

## Sponsor Tier Guide

| Tier | Logo Size | Use For |
|------|-----------|---------|
| **title** | 80px height | Primary sponsor |
| **associate** | 60px height | Associate sponsors |
| **supporting** | 50px height | Supporting partners |
| **custom** | 50px height | Category-specific (hydration, t-shirt, timing, etc.) |

---

## Logo File Naming

Use clear, descriptive filenames:
- ✅ `acme-corp.png`
- ✅ `title-sponsor-1.png`
- ✅ `associate-sponsor.png`
- ✅ `hydration-partner.png`
- ❌ `logo1.png` (unclear)
- ❌ `sponsor.png` (not descriptive)

---

## Display Preview

After adding sponsors, the registration header will look like:

```
┌─────────────────────────────────────────────┐
│ [CS Logo] Hosted by Connected Steps         │
├─────────────────────────────────────────────┤
│ [IT Run Logo]  THE IT RUN SPRINT-2          │
│ 📍 Hyderabad Central University...          │
├─────────────────────────────────────────────┤
│ TITLE SPONSOR                               │
│ [Sponsor Logo]                              │
├─────────────────────────────────────────────┤
│ ASSOCIATE SPONSORS                          │
│ [Logo 1]  [Logo 2]  [Logo 3]                │
├─────────────────────────────────────────────┤
│ HYDRATION PARTNER                           │
│ [Logo]                                      │
└─────────────────────────────────────────────┘
```

---

## Directory Structure

```
connected-steps/
└── public/
    └── events/
        └── it-run-sprint-2/
            ├── IT Run Sprint-2 Logo.jpeg
            └── sponsors/
                ├── title-sponsor.png          ← Add logos here
                ├── associate-1.png
                ├── associate-2.png
                └── hydration-partner.png
```

---

## Optional: Add Sponsor Links

Sponsors with a `url` property become clickable links:

```typescript
{ 
  filename: "acme-corp.png", 
  name: "ACME Corporation", 
  url: "https://acme.com"  // ← Makes logo clickable
}
```

Sponsors without `url` are non-clickable:

```typescript
{ 
  filename: "local-partner.png", 
  name: "Local Partner"
  // No url = non-clickable
}
```

---

## Testing

1. Add sponsor logos to `/public/events/it-run-sprint-2/sponsors/`
2. Update `sponsorConfig` in `EventBranding.tsx`
3. Save and commit
4. Deploy
5. Visit registration page → sponsors appear in header

---

## Troubleshooting

**Logos not appearing?**
- Check filename matches exactly in config
- Verify file is in `/public/events/it-run-sprint-2/sponsors/`
- Confirm filename has no typos

**Logo looks wrong?**
- Use transparent PNG for best appearance
- Test in browser DevTools (check URL loads)
- Verify file format (PNG, JPG, or WebP)

**Need to remove sponsors?**
- Comment out the tier in `sponsorConfig`
- Or delete the tier object entirely

---

## For Future Events

To add sponsors to a different Connected Steps event:

1. Create directory: `/public/events/{event-name}/sponsors/`
2. Add this to your event header:
   ```typescript
   <EventSponsors eventName="{event-name}" />
   ```
3. Update sponsor config for that event
4. Done!

Example for Marathon 2027:
```typescript
// In EventBranding.tsx for Marathon event
<EventSponsors eventName="marathon-2027" />
```

Then create: `/public/events/marathon-2027/sponsors/` and add logos there.

---

## Need Help?

- Logos not displaying? Check browser DevTools → Network tab → image URL
- Unsure about tier? See "Sponsor Tier Guide" above
- Want to add partner category? Use `tier: "custom-name"` - system handles it automatically

