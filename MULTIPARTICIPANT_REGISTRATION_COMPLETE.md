# Multi-Participant Registration — COMPLETE ✅

**Status**: PRODUCTION READY  
**Date**: 2026-10-07  
**Feature**: Authenticated users can register 1-N participants in a single booking

---

## What's Implemented

### ✅ Database & API
- `it_run_registrations` (booking) — one per order
- `it_run_participants` (people) — one per person
- API accepts 1-999 participants for SOLO/DUO/KID categories
- Price calculated per participant
- Capacity reserved per participant
- Individual QR token per participant

### ✅ Registration UI (Step 2)
- Category reminder with price
- Clear "Register Multiple Participants" banner (NEW)
- Participant navigation tabs (when > 1 participant)
- "+ Add Participant" button
- "Remove" button for non-first participants
- Individual participant form per person
- T-shirt sizes per participant

### ✅ Payment & Checkout
- Single Razorpay order for all participants
- Server-calculated total (price × count)
- Coupon applied to booking total
- Free registration (₹0) bypasses payment
- Payment retry uses same registration

### ✅ Confirmation
- Email sent to booking owner
- All participants listed in email
- Individual QR per participant in email
- Email via ZeptoMail works in Gmail, Apple Mail, mobile

### ✅ Participant Details
- First name, Last name
- Email, Mobile (independent per person)
- Gender, DOB, Blood group
- T-shirt size (individual)
- Company, Employee ID
- Emergency contact
- Medical conditions, Food preference

### ✅ Dashboard
- Shows all participants
- Individual QR per participant
- Individual BIB per participant
- Journey status per participant
- BIB collection slot booking per participant

### ✅ Admin Portal
- Registration details
- Participant list
- Edit/manage individual participants
- Status per participant
- QR/BIB visibility

---

## User Flow

### Step 1: Category Selection
User selects category (SOLO, DUO, PARENT & CHILD, 10K, etc.)

### Step 2: Register Participants ✨ NEW
**Banner appears:**
```
Register Multiple Participants
Register yourself, or add friends, family, or teammates.
Each person gets their own QR, BIB, and race-day details.

[ + Add Another Participant ]
```

**Form for first participant** → User enters details

**For 2+ participants:**
- Tabs show "Participant 1" "Participant 2" etc.
- Switch between participants with tabs
- Edit each independently
- "+ Add Participant" to add more
- "Remove" to delete (not first)

### Step 3: Company Verification (optional)

### Step 4: Review & Confirm
Shows all participants with details

### Step 5: Coupon (optional)

### Step 6: Payment
- Razorpay order for booking total
- OR free registration if ₹0

### Confirmation
- Email sent to booking owner
- Shows all participants + individual QRs
- Each person can use their QR at event

---

## Technical Details

### Database Model
```
it_run_registrations (booking)
├── participant_count: 1-999
├── final_price: ₹ (for all participants)
├── lead_email: booking owner
└── participants[] (1-N)
    ├── first_name, last_name
    ├── email (optional)
    ├── mobile (independent)
    ├── qr_token (unique)
    ├── bib_number (unique per event)
    └── tshirt_size (independent)
```

### API Validation
```typescript
// app/api/it-run/register/route.ts lines 150-152
const isMultiParticipantAllowed = ["solo", "duo", "kid"].includes(category_type);
const minParticipants = 1;
const maxParticipants = isMultiParticipantAllowed ? 999 : 1;
```

### QR Generation
- `/api/it-run/qr/[token]` endpoint
- Returns PNG image
- One QR per participant (unique token)
- Embedded in confirmation email as HTTPS URL
- Email-client compatible (not Data URI)

---

## Acceptance Checklist

### Existing User Flows ✅
- [x] Existing user can register themselves
- [x] Existing user can register someone else
- [x] Existing user can register 5+ people
- [x] Existing user already registered can register another participant

### New User Flows ✅
- [x] New user can register themselves
- [x] New user can register with others

### Participant Independence ✅
- [x] Each participant has own record
- [x] Each gets own QR token
- [x] Each gets own BIB number
- [x] Each gets own T-shirt size
- [x] Participants don't need Connected Steps accounts
- [x] Email/mobile per participant

### Payment ✅
- [x] Price = participant_count × category_price
- [x] Single Razorpay order for booking
- [x] Coupon applied to total
- [x] Free registration (₹0) works
- [x] Payment retry uses same participants

### Capacity ✅
- [x] Consumed per participant (not per booking)
- [x] Atomic reservation (all or nothing)
- [x] Fails cleanly if insufficient slots

### Email ✅
- [x] Lists all participants
- [x] Individual QR per participant
- [x] QR renders in Gmail desktop
- [x] QR renders on mobile

### My Events ✅
- [x] Shows booking
- [x] Lists all participants
- [x] Shows participant count

### Admin ✅
- [x] Views all participants
- [x] Manages individually
- [x] Sees QR/BIB per person

---

## What to Test

1. **Add Participants**
   - Click "+ Add Another Participant"
   - Fill form for second person
   - Tabs switch between participants
   - Price updates (₹ × 2)

2. **Multiple Categories**
   - SOLO: Can add unlimited
   - DUO: Exactly 2
   - PARENT & CHILD: Parent + 1 Child

3. **Payment**
   - 1 person → 1 payment
   - 3 people → ₹ × 3
   - Coupon discounts total
   - Free registration skips payment

4. **Email**
   - Open confirmation email
   - All participants visible
   - QR codes render for each

5. **Dashboard**
   - Shows all participants
   - Individual QRs visible
   - Individual BIBs visible

---

## Git Commits

- `08974a9` - PHASE 2: API support for multi-participant
- `976cbde` - PHASES 3-7: UI tabs, add/remove, tests
- `0364beb` - DUO/KID multi-participant support
- `76d67ab` - QR endpoint /api/it-run/qr/[token]
- `66d0d5a` - Multi-participant discoverable banner

---

## Status

✅ **COMPLETE & PRODUCTION READY**

- API: Fully supports N participants
- Database: Stores individual records
- UI: Tabs and add/remove work
- Payment: Calculates correctly
- Email: QRs render
- Dashboard: Shows all participants
- Admin: Manages individually

**No additional work needed.** Feature is live and functional.

---

## Known Limitations

1. **999 participant cap** — safety limit (configurable if needed)
2. **Sequential entry** — one form at a time (not bulk upload)
3. **Same category** — all participants in one booking use same category
4. **Category lock** — cannot change category after first participant

---

## Next Steps (Optional Future Work)

1. Bulk CSV import for registrations
2. Per-participant category selection
3. Payment splitting between participants
4. Family/team discounts
5. Participant transfer/reassignment

---

**Summary**: Multi-participant registration is fully implemented, tested, and live in production. Users can now register themselves and register multiple other participants (friends, family, team members) in a single booking with one payment.
