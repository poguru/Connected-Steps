# Phases 3-7 Multi-Participant Implementation

**Status**: IN PROGRESS  
**Date**: 2026-10-07  
**Owner**: Claude Haiku 4.5

---

## Phase 3: UI Registration Form - Multi-Participant Support

### Key Changes Required

1. **Step 2 - Participants Form**
   - Add "Add Participant" button to allow adding more participants for SOLO categories
   - Add "Remove Participant" option for non-first participants
   - Show tabs/list of all participants in step 2
   - Allow editing any participant by clicking on them

2. **State Management**
   - Keep current `participantSubIdx` tracking
   - Allow dynamic participant count (not just `category.participant_count`)
   - Maintain errors per participant

3. **Handlers Needed**
   - `addParticipant()` - Add empty participant for SOLO categories
   - `removeParticipant(idx)` - Remove participant (only if not first)
   - UI changes to StepParticipants component

### Files to Change
- `app/it-run/register/page.tsx` - Add participant management handlers and UI

---

## Phase 4: Dashboard - Show All Participants

### Key Changes Required

1. **Display all participants instead of first-only**
   - Update `app/it-run/dashboard/[code]/page.tsx`
   - Show each participant's BIB, T-Shirt, QR code
   - "Register Another Participant" button

### Files to Change
- `app/it-run/dashboard/[code]/page.tsx`

---

## Phase 5: Admin Portal - Participants View

### Key Changes Required

1. **Registrations View Enhancement**
   - Add participant count column
   - Show summary of participants in expandable section

2. **New Participants Admin View**
   - Create dedicated participants page
   - Columns: Name, Category, Email, BIB, T-Shirt, Status
   - Filter by booking, category, status, etc.
   - Actions: View Booking, Edit, Mark Check-in

### Files to Change
- Admin registrations page (enhancement)
- Create new admin participants page

---

## Phase 6: Confirmation Email - All Participants

### Key Changes Required

1. **Email Template Enhancement**
   - Include all participants (not just first)
   - Individual QR codes for each participant
   - Summary table with BIB numbers

### Files to Change
- `lib/it-run-email.ts` - Update confirmation email template

---

## Phase 7: Comprehensive Testing

### Test Cases

1. **Unit Tests** (10+ cases)
   - Participant creation/removal/editing
   - Capacity calculation for N participants
   - Price calculation for N participants
   - Coupon application on total

2. **Integration Tests** (15+ cases)
   - 1 participant registration (backward compat)
   - 2 participant registration (backward compat DUO)
   - 3+ participant registration (multi)
   - Payment success/failure
   - Draft resume

3. **E2E Tests** (10+ cases)
   - Full browser registration flow
   - Multi-participant add/remove
   - Payment processing
   - Email delivery

### Files to Create/Modify
- `__tests__/api/it-run/register.test.ts` (new/enhanced)
- `__tests__/ui/register.test.tsx` (new/enhanced)

---

## Implementation Order

1. ✅ Phase 2: API blocker fix (DONE - commit 08974a9)
2. ⏳ Phase 3: Registration form UI (IN PROGRESS)
3. ⏳ Phase 4: Dashboard updates
4. ⏳ Phase 5: Admin portal
5. ⏳ Phase 6: Email templates
6. ⏳ Phase 7: Testing

---

## Success Criteria

- [x] API accepts multi-participant registrations
- [ ] UI allows adding/removing participants (SOLO only)
- [ ] Dashboard shows all participants with QR codes
- [ ] Admin can see all participants per booking
- [ ] Email includes all participants with QR codes
- [ ] All existing registrations still work (backward compat)
- [ ] Tests pass (40+ test cases)
- [ ] Production ready

---

**Next**: Implement Phase 3 registration form changes
