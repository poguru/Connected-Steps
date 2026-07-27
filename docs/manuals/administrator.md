# Connected Steps — Administrator Manual

**Version 3.0 · 2026-07-28**

---

## Introduction

The Connected Steps admin portal at `/admin` gives your organisation full control over events, participants, communications, finances, and integrations. This manual covers the tasks you'll perform day-to-day and end-to-end.

---

## Logging In

1. Go to `/admin/login`
2. Enter the admin password (set by your technical team)
3. You are now in the admin dashboard

Your session lasts 30 days. If you see "Unauthorized", your session has expired — log in again.

---

## Managing Organisations

If your account manages multiple organisations, use the **Orgs** section (`/admin/orgs`) to switch between them.

### Inviting a Team Member

1. Go to `/admin/orgs/:id/members`
2. Click **Invite Member**
3. Enter their email and choose a role:
   - **Owner** — full access including deleting the org
   - **Admin** — full access except org deletion
   - **Finance** — view registrations, process refunds, view finance reports
   - **Operations** — manage events, volunteers, BIB/t-shirt collection
   - **Volunteer Manager** — manage volunteer assignments
   - **Communications** — send emails and WhatsApp messages
   - **Support** — view registrations, handle participant queries
   - **Read Only** — view everything, change nothing
4. Click **Send Invite**

The invitee receives an email with instructions to set up their account.

---

## Creating an Event

1. Go to `/admin/events/new`
2. Fill in the event details:
   - **Name, Description, Location** — used on the public event page
   - **Start/End Date** — must be in the future
   - **Registration Close** — when the registration form closes
   - **Capacity** — total participant slots (leave blank for unlimited)
   - **Race Categories** — add each race distance (5K, 10K, etc.) with its own capacity and price
3. Configure registration settings:
   - **Form Fields** — customise what information you collect
   - **T-shirt sizes**, **BIB assignment**, **Certificate eligibility**
4. Add a **Route Map** (GPX file or image)
5. Set **Pricing Rules** — early-bird discounts, coupons
6. Click **Save as Draft**

To publish the event for registrations:
1. Complete all required sections
2. Click **Submit for Review** (status changes to `review`)
3. Once reviewed, click **Publish** (status becomes `published`)

---

## Managing Registrations

### Viewing Registrations

Go to `/admin/events/:id/registrations` to see all registrations for an event. You can:
- Search by name or email
- Filter by status (confirmed, cancelled, waitlisted)
- Filter by payment status
- Export to CSV

### Processing a Refund

1. Open the registration (`/admin/events/:id/registrations/:code`)
2. Click **Refund**
3. Choose full or partial refund amount
4. Add a reason note
5. Click **Process Refund**

Refunds return to the original Razorpay payment method. Allow 5–7 business days.

### Manual Check-In

If the QR scanner is unavailable:
1. Go to `/admin/events/:id/race-day`
2. Search by name or registration code
3. Click **Check In**

---

## BIB and T-Shirt Collection

### BIB Distribution

1. Go to `/admin/events/:id/bib`
2. For each participant: scan their QR code or search by name
3. Enter the BIB number and click **Assign**

### T-Shirt Collection

1. Go to `/admin/events/:id/participants` (or use the mobile scanner)
2. Scan the participant's QR code
3. Confirm their t-shirt size and click **Mark Collected**

---

## Sending Communications

### Sending an Email to Event Participants

1. Go to `/admin/events/:id/communicate`
2. Choose a template or write a custom message
3. Select audience: all registered, confirmed only, specific status
4. Preview the email
5. Click **Send** (immediate) or **Schedule** (future date/time)

### WhatsApp Broadcast

WhatsApp messages use pre-approved templates. Go to `/admin/communication`:
1. Choose the **WhatsApp** channel
2. Select the template (e.g., "event_reminder", "payment_confirmation")
3. Fill in the template variables
4. Select recipients
5. Click **Send**

### Communication History

Every sent message is recorded in the **Communication History** tab on each event page. You can see delivery status, open rates, and bounce reports.

---

## Finance

### Finance Dashboard

`/admin/finance/dashboard` shows:
- Revenue this month vs last month
- Registrations by payment status
- Refunds pending
- Outstanding payouts

### Recording a Manual Payment

For offline payments (bank transfer, cash):
1. Go to `/admin/finance/manual-payments`
2. Click **Record Payment**
3. Enter registration code, amount, reference number, and payment date
4. Click **Save**

### Payouts

1. Go to `/admin/finance/payouts`
2. Click **New Payout Batch**
3. Add payout line items with amounts and bank details
4. Click **Mark as Processing**
5. After bank transfer is complete, click **Mark as Completed**

---

## Merchandise

### Managing Products

1. Go to `/admin/merchandise`
2. Click **New Product** to add a new item
3. Add variants (sizes/colours) with individual SKUs and stock levels
4. Click **Publish** to make it available

### Viewing Orders

The merchandise orders list shows all orders with status: pending, confirmed, shipped, cancelled.

---

## Sponsors

1. Go to `/admin/events/:id/sponsors`
2. Click **Add Sponsor**
3. Fill in name, tier, contact email, and sponsorship amount
4. Upload logo (optional)

---

## Developer Portal

If your organisation has API access enabled, manage integrations at `/admin/developer`:

- **API Keys** — create keys for external systems to query your data
- **Webhooks** — send real-time event notifications to your systems
- **Import** — bulk-load participants or merchandise via CSV
- **Automations** — trigger actions automatically when events occur
- **Monitoring** — view API usage and webhook health

See the [API Guide](../api-guide.md) for full developer documentation.

---

## Settings

### Notification Preferences

`/admin/settings/notifications` — configure which admin actions trigger email or in-app notifications for your team.

### Reminders

`/admin/settings/reminders` — configure automatic reminders sent to participants (registration confirmation, event day reminder, results available).

---

## Common Issues

**"Participant is not showing up in the check-in list"**  
The participant may be on the waitlist (not confirmed) or have a different registration status. Check their status in `/admin/events/:id/registrations`.

**"Registration form is not accepting payments"**  
Verify Razorpay keys are configured and the event price is set correctly. Check `/api/health` for Razorpay connectivity.

**"Emails are not being delivered"**  
Check the communication history for bounce reports. If the user's email is bounced, it may be on the ZeptoMail suppression list. Contact support.

**"BIB assignment is not saving"**  
This can happen if two volunteers are assigning BIBs to the same participant simultaneously. Refresh and try again.
