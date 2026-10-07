# Multi-Participant Registration Implementation Plan

**Status**: Planning Phase  
**Priority**: CRITICAL FEATURE  
**Estimated Effort**: Very High (Multiple Sprints)  
**Start Date**: 2026-10-07  

---

## Executive Summary

Enable one booking/registration to contain **N participants** where each participant has:
- Independent participant identity
- Unique QR code
- Individual BIB allocation
- Category selection per participant
- Independent T-shirt size
- Personal details (name, email, mobile, DOB, etc.)

**Key Principle**: Separate Connected Steps Account (user/booking owner) from Event Participant (person registering).

---

## Phase 1: Code Audit & Architecture Review

### Phase 1.1: Database Schema Audit
- [ ] Review `it_run_registrations` table structure
- [ ] Review `it_run_participants` table structure
- [ ] Verify relationship (should be 1:N)
- [ ] Check for hidden assumptions (participant_count, single participant fields)
- [ ] Review foreign keys and constraints
- [ ] Document capacity reservation model
- [ ] Document payment relationship
- [ ] Review participant status fields

**Deliverable**: Database schema audit report

### Phase 1.2: API Audit
Identify all APIs assuming single participant per registration:

**Registration/Booking APIs**:
- [ ] POST `/api/it-run/register` - Create registration
- [ ] GET `/api/it-run/registration/:code` - Get registration details
- [ ] PUT `/api/it-run/registration/:id` - Update registration
- [ ] DELETE `/api/it-run/registration/:id` - Cancel registration

**Participant APIs**:
- [ ] GET `/api/it-run/participants` - List participants
- [ ] POST `/api/it-run/participants` - Create participant
- [ ] PUT `/api/it-run/participants/:id` - Update participant
- [ ] DELETE `/api/it-run/participants/:id` - Delete participant

**Payment APIs**:
- [ ] POST `/api/it-run/payment/create-order` - Create payment order
- [ ] POST `/api/it-run/payment/verify` - Verify payment
- [ ] GET `/api/it-run/payment/:id` - Get payment details
- [ ] Razorpay webhook handling

**Coupon APIs**:
- [ ] POST `/api/it-run/coupons/validate` - Validate coupon
- [ ] GET `/api/it-run/coupons/:code` - Get coupon details

**Capacity APIs**:
- [ ] Check capacity reservation logic
- [ ] Verify atomic operations

**Deliverable**: API audit report with change requirements

### Phase 1.3: UI Flow Audit
- [ ] Review registration form
- [ ] Review participant form
- [ ] Review payment flow
- [ ] Review confirmation page
- [ ] Review dashboard
- [ ] Review QR code display

**Deliverable**: UI flow audit with mockups

### Phase 1.4: Admin Portal Audit
- [ ] Review registration management
- [ ] Review participant management
- [ ] Review reports/statistics
- [ ] Review CSV export

**Deliverable**: Admin audit report

---

## Phase 2: Database Schema Updates (Safe Approach)

### Phase 2.1: Verify Existing Schema Supports 1:N

**Action**: Confirm `it_run_registrations` (1) → `it_run_participants` (N) relationship exists

**If YES** (likely):
- Proceed with API/UI changes
- No major schema changes needed
- Add indexes if needed

**If NO**:
- Design migration strategy
- Test on staging
- Plan rollback

### Phase 2.2: Index Optimization
- [ ] Add index on `it_run_participants(registration_id)`
- [ ] Add index on `it_run_participants(qr_token)`
- [ ] Add index on `it_run_participants(bib_number)`
- [ ] Add index on `it_run_registrations(event_id, user_id)`

**Migration**: `20261007000002_multi_participant_indexes.sql`

### Phase 2.3: Metadata Audit
- [ ] Verify `participant_count` exists on registrations
- [ ] Verify `category_id` per participant (not just registration)
- [ ] Verify QR uniqueness constraint
- [ ] Verify BIB uniqueness constraint

**Deliverable**: Database readiness report

---

## Phase 3: API Implementation

### Phase 3.1: Booking/Registration Endpoints

**POST `/api/it-run/register`** (Enhanced)
```
Current: 
  - Single participant data in request
  - Creates 1 participant

New:
  - Array of participants
  - Validates all participants
  - Creates N participants atomically
  - Returns booking with participant list
```

**Changes Required**:
- Validate participant count
- Calculate total price (sum of all participants)
- Reserve capacity per participant
- Apply coupon to booking
- Create all participants atomically

**GET `/api/it-run/registration/:code`** (Enhanced)
```
Current:
  - Returns registration + single participant

New:
  - Returns registration + array of participants
  - Include participant counts
  - Include per-participant status
```

### Phase 3.2: Participant CRUD Endpoints

**POST `/api/it-run/registrations/:registrationId/participants`**
```
Add participant to existing booking
- Validate registration ownership
- Validate event still open
- Validate category/capacity
- Recalculate price
- Handle payment difference if needed
```

**PUT `/api/it-run/participants/:participantId`**
```
Update participant
- Validate registration ownership
- Prevent editing after BIB allocation (unless permitted)
- Handle category changes
- Recalculate price if category changed
```

**DELETE `/api/it-run/participants/:participantId`**
```
Remove participant from booking
- Validate registration ownership
- Release capacity
- Calculate refund
- Handle refund processing
```

### Phase 3.3: Payment Flow Updates

**POST `/api/it-run/payment/create-order`** (Enhanced)
```
Current:
  - Single participant price

New:
  - Sum all participant prices
  - Apply coupon to booking total
  - Create single Razorpay order for all participants
  - Return order details
```

**Webhook Handler** (Enhanced)
```
On payment success:
  - Mark all participants in booking as confirmed atomically
  - Generate QR for each participant
  - Send confirmation email with all participants
  - Log capacity and coupon consumption
```

### Phase 3.4: Capacity & Coupon Updates

**Capacity Reservation**:
```
Current: 
  - Reserve 1 slot per registration

New:
  - Reserve N slots (one per participant)
  - Validate all N slots available before commitment
  - Release all on rollback
```

**Coupon Validation**:
```
Current:
  - Validate against single participant

New:
  - Validate against booking (all participants)
  - Calculate discount on total
  - Check coupon eligibility per booking rules
```

---

## Phase 4: UI Implementation

### Phase 4.1: Registration Form (Multi-Participant)

```
Step 1: Category Selection
  → Select category (same as current)

Step 2: Participants
  → How many participants?
     Participant 1: [Me]
     Participant 2: [Friend] + [Add More]
     Participant 3: [Family] + [Add More]
  
  For each participant:
    - First Name
    - Last Name
    - Gender (if applicable)
    - DOB (if applicable)
    - Email (optional for non-account-holders)
    - Mobile (if applicable)
    - Blood Group
    - T-Shirt Size
    - Emergency Contact (if applicable)
    - Company (if applicable)

Step 3: Verification/Upload
  → Optional company IDs per participant

Step 4: Review
  → Show all participants
  → Show per-participant details
  → Show total price
  → Option to edit individual participants

Step 5: Coupon
  → Apply coupon to booking
  → Show final price for all participants

Step 6: Payment
  → Single payment for all participants
  → Show all participants in payment summary

Step 7: Success
  → Show booking code
  → Show QR for each participant
  → Send email with all participant details
```

### Phase 4.2: Dashboard Updates

```
My Registrations

Booking #1 - ITRUN-ABC123
├── 3 Participants
├── Status: Confirmed
├── Category: Mixed (5K + 10K)
├── Total: ₹2445
├── Paid: ✓
└── Action Buttons:
    - View Details
    - Register Another Participant [New]
    - Download All QRs
    - Download Invoice
    - Cancel Booking (if allowed)

[Register Another Participant] [New Button]
```

### Phase 4.3: Existing User Flow

```
If user is logged in and already registered:

Welcome back, Kalyan!

[My Registrations]
  - Existing bookings

[Register Another Participant] [New Primary Action]
  → Opens new registration flow
  → Starts fresh
  → Do NOT mutate existing registration
```

---

## Phase 5: Admin Portal Updates

### Phase 5.1: Registrations View

```
Registrations (Bookings)

┌─ ID ─ Owner ─ Participants ─ Status ─ Payment ─ Total ─┐
│ ...                                                      │
└────────────────────────────────────────────────────────┘

Click on registration:
  → Expand to show all participants
  → Show per-participant status
  → Show per-participant QR/BIB/T-shirt

[Actions]
  - View Participants
  - Edit Booking
  - Issue Refund
  - View Payment
  - Cancel Booking
```

### Phase 5.2: Participants View (New)

```
Participants

┌─ ID ─ Name ─ Category ─ Email ─ BIB ─ T-Shirt ─ Status ─┐
│ ...                                                        │
└─────────────────────────────────────────────────────────┘

Filter/Search:
  - By booking
  - By category
  - By status
  - By company
  - By name/email/mobile
  - By BIB
  - By T-shirt size

Actions:
  - View Booking
  - Edit Participant
  - Generate QR
  - Issue BIB
  - Issue T-Shirt
  - Mark Check-in
```

### Phase 5.3: Reports Update

```
Dashboard Statistics

Registrations (Bookings): 150
Participants: 237

By Category:
  - 5K Fun Run: 89 participants
  - 5K Timed: 76 participants
  - 10K Timed: 72 participants

By Status:
  - Confirmed: 229 participants
  - Pending: 5 participants
  - Cancelled: 3 participants

By T-Shirt:
  - S: 45 participants
  - M: 92 participants
  - L: 89 participants
  - XL: 11 participants
```

---

## Phase 6: Testing & Validation

### Phase 6.1: Unit Tests
- [ ] Participant creation with validation
- [ ] Capacity calculation (N participants)
- [ ] Price calculation (N participants)
- [ ] Coupon application on booking
- [ ] Category validation per participant
- [ ] QR generation uniqueness

### Phase 6.2: Integration Tests
- [ ] Complete registration flow (1 participant)
- [ ] Complete registration flow (3 participants)
- [ ] Complete registration flow (5 participants)
- [ ] Payment success with 3 participants
- [ ] Payment failure recovery
- [ ] Draft resume with multiple participants
- [ ] Participant cancellation
- [ ] Category change

### Phase 6.3: End-to-End Tests
- [ ] Browser registration flow
- [ ] Payment processing
- [ ] Email confirmation
- [ ] QR scanning
- [ ] BIB allocation
- [ ] T-shirt issuance
- [ ] Admin operations

### Phase 6.4: Regression Tests
- [ ] Existing single-participant registrations work
- [ ] Existing Duo registrations work
- [ ] Existing Parent & Child registrations work
- [ ] Dashboard displays correctly
- [ ] Reports are accurate
- [ ] Admin functions work

---

## Phase 7: Deployment & Rollout

### Phase 7.1: Staging Deployment
- Deploy to staging environment
- Run full test suite
- Verify with test data
- Load testing with multiple participants

### Phase 7.2: Production Rollout
- Database migrations (non-breaking)
- Deploy API changes
- Deploy UI changes
- Enable feature flag for multi-participant
- Monitor logs and metrics

### Phase 7.3: Gradual Rollout (Optional)
- Release to 10% of users first
- Monitor error rates
- Gradually increase to 100%

---

## Risk Assessment

### High Risk Areas
1. **Payment atomicity**: All participants must confirm together
2. **Capacity reservation**: Must handle N participants correctly
3. **Database migrations**: Must be reversible
4. **Backwards compatibility**: Existing registrations must work

### Mitigation Strategies
1. Use transactions for atomic operations
2. Test capacity with high numbers (1000+)
3. Stage migrations carefully
4. Comprehensive regression testing
5. Feature flags for gradual rollout

---

## Timeline Estimate

| Phase | Duration | Notes |
|-------|----------|-------|
| Phase 1 (Audit) | 2-3 days | Discovery |
| Phase 2 (DB) | 1 day | Usually minimal changes |
| Phase 3 (API) | 5-7 days | Most complex |
| Phase 4 (UI) | 4-5 days | Significant UI changes |
| Phase 5 (Admin) | 2-3 days | Reporting updates |
| Phase 6 (Testing) | 5-7 days | Comprehensive coverage |
| Phase 7 (Deploy) | 2-3 days | Staging + Production |
| **Total** | **21-28 days** | Full Sprint+ |

---

## Next Steps

1. **Start Phase 1**: Code audit (begin immediately)
2. **Document findings**: Specific files and functions
3. **Create detailed change specifications**
4. **Begin Phase 3**: API changes (highest impact)
5. **Parallel Phase 4**: UI mockups
6. **Phase 6**: Automated test development
7. **Phase 7**: Staged deployment

---

## Success Criteria

✅ One booking supports N participants  
✅ First-time users can add multiple participants  
✅ Existing users can register more people  
✅ Each participant has unique QR/BIB/T-shirt  
✅ Payment is booking-level  
✅ Capacity correct per participant  
✅ Admin reports accurate  
✅ Existing registrations still work  
✅ All tests pass  
✅ Production ready  

---

**Owner**: Connected Steps Team  
**Status**: Ready for Phase 1 Kickoff
