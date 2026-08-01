"use client";

/**
 * Connected Steps Design System — Living Documentation
 * URL: /admin/design-system
 *
 * This page serves as:
 * 1. Visual reference for every component and variant
 * 2. Migration guide for existing pages
 * 3. Interactive playground for verifying component behaviour
 */

import React, { useState } from "react";
import {
  // Tokens
  color,
  // Atoms
  Button, Badge, StatusBadge,
  PageTitle, SectionTitle, Label, Text,
  // Feedback
  Alert, EmptyState, ErrorState, Spinner, LoadingState,
  Skeleton, SkeletonCard, SkeletonTable,
  // Forms
  Input, Textarea, Select, FormGroup, FormRow,
  Checkbox, Radio, Toggle, SearchInput, PasswordInput,
  // Data display
  ProgressBar, Avatar, AvatarGroup, Chip, StatCard, Timeline,
  // Containers
  Card,
  // Modal/Drawer
  Modal, ConfirmDialog, Drawer,
  // Navigation
  Breadcrumbs, Tabs, SegmentedControl, Pagination, Stepper,
  // Layout
  PageHeader, Container, Divider, SectionRow, StatStrip,
} from "@/components/ui/ds";

// ── Section wrapper ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "40px" }}>
      <div style={{ fontSize: "11px", fontWeight: 700, color: color.orange, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "16px", paddingBottom: "8px", borderBottom: `1px solid ${color.border}` }}>
        {title}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap" as const, gap: "10px", alignItems: "flex-start" }}>
        {children}
      </div>
    </div>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ fontSize: "10px", color: color.textMuted }}>{label}</div>
      {children}
    </div>
  );
}

export default function DesignSystemPage() {
  const [checkA,  setCheckA]  = useState(false);
  const [radio,   setRadio]   = useState("a");
  const [toggle,  setToggle]  = useState(false);
  const [tab,     setTab]     = useState("overview");
  const [seg,     setSeg]     = useState("list");
  const [page,    setPage]    = useState(1);
  const [step,    setStep]    = useState(1);
  const [search,  setSearch]  = useState("");
  const [modal,   setModal]   = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [drawer,  setDrawer]  = useState(false);

  return (
    <div style={{ minHeight: "100vh", background: color.black, color: "#fff", fontFamily: "var(--font-dm-sans), sans-serif" }}>
      <Container style={{ padding: "32px 24px 80px" }}>
        <PageHeader title="Design System" breadcrumb={<Breadcrumbs items={[{ label: "Admin", href: "/admin" }, { label: "Design System" }]} />} />
        <div style={{ background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.3)", borderRadius: 8, padding: "10px 16px", marginBottom: 24, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>🔧</span>
          <span style={{ fontSize: "0.85rem", color: "#fbbf24", fontWeight: 600 }}>Internal Design System</span>
          <span style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.45)", marginLeft: 4 }}>Developer / designer reference only — not visible to end users</span>
        </div>
        <Text muted style={{ marginBottom: "40px" }}>
          Connected Steps UI component library. Import everything from <code style={{ color: color.orange }}>@/components/ui/ds</code>.
        </Text>

        {/* Colours */}
        <Section title="Color Tokens">
          {Object.entries({ orange: color.orange, success: color.success, error: color.error, warning: color.warning, info: color.info, textPrimary: color.textPrimary, textMuted: color.textMuted, border: color.border }).map(([k, v]) => (
            <Block key={k} label={k}>
              <div style={{ width: 48, height: 48, borderRadius: 8, background: v, border: `1px solid ${color.border}` }} />
              <div style={{ fontSize: "10px", color: color.textMuted, fontFamily: "monospace" }}>{v.slice(0, 22)}</div>
            </Block>
          ))}
        </Section>

        {/* Buttons */}
        <Section title="Button">
          {(["primary","secondary","outline","ghost","danger"] as const).map(v => (
            <Button key={v} variant={v}>{v}</Button>
          ))}
          <Button loading>Loading</Button>
          <Button size="xs">XS</Button>
          <Button size="sm">SM</Button>
          <Button size="lg">LG</Button>
          <Button icon="🚀">With icon</Button>
          <Button disabled>Disabled</Button>
        </Section>

        {/* Badges */}
        <Section title="Badge">
          {(["orange","green","red","yellow","blue","purple","gray"] as const).map(c => (
            <Badge key={c} color={c} dot>{c}</Badge>
          ))}
          <Divider style={{ width: "100%", margin: "4px 0" }} />
          {["Confirmed","Pending","Cancelled","Published","Registration Open","Draft"].map(s => (
            <StatusBadge key={s} status={s} />
          ))}
        </Section>

        {/* Typography */}
        <Section title="Typography">
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "12px" }}>
            <PageTitle>Page Title (DM Sans 700)</PageTitle>
            <SectionTitle>Section Title</SectionTitle>
            <Label>Micro Label — orange, uppercase</Label>
            <Text>Body text — secondary colour, 14px, 1.6 line-height</Text>
            <Text size="sm" muted>Small muted text</Text>
          </div>
        </Section>

        {/* Feedback */}
        <Section title="Alert">
          {(["success","error","warning","info"] as const).map(v => (
            <Alert key={v} variant={v} style={{ minWidth: "220px" }}>This is a {v} alert.</Alert>
          ))}
        </Section>

        <Section title="Spinner & Loading">
          <Spinner size={20} />
          <Spinner size={28} color={color.success} />
          <LoadingState label="Fetching data…" />
        </Section>

        <Section title="Skeleton">
          <SkeletonCard />
          <div style={{ width: "260px" }}><Skeleton height="12px" /><Skeleton height="12px" width="60%" style={{ marginTop: 8 }} /></div>
        </Section>

        <Section title="Empty / Error States">
          <EmptyState icon="📭" title="No sessions yet" body="Create your first training session to get started." action={<Button size="sm">Create Session</Button>} style={{ border: `1px solid ${color.border}`, borderRadius: 12, minWidth: 260 }} />
          <ErrorState message="Could not load events. Check your connection and try again." action={<Button size="sm" variant="secondary">Retry</Button>} style={{ border: `1px solid ${color.errorBorder}`, borderRadius: 12, minWidth: 260 }} />
        </Section>

        {/* Forms */}
        <Section title="Form Controls">
          <div style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <Input label="Full Name" placeholder="Your name" hint="As it appears on your ID" />
            <Input label="Email" placeholder="you@example.com" type="email" error="Please enter a valid email" />
            <PasswordInput label="Password" placeholder="Enter password" />
            <SearchInput value={search} onChange={e => setSearch(e.target.value)} onClear={() => setSearch("")} placeholder="Search members…" />
            <Select label="Distance"><option>5K</option><option>10K</option><option>21K</option></Select>
            <Textarea label="Notes" placeholder="Optional notes…" />
          </div>
          <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", marginTop: "8px" }}>
            <Checkbox checked={checkA} onChange={setCheckA} label="I agree to terms" hint="Read the terms carefully" />
            <Radio value="a" checked={radio === "a"} onChange={setRadio} label="Option A" />
            <Radio value="b" checked={radio === "b"} onChange={setRadio} label="Option B" />
            <Toggle checked={toggle} onChange={setToggle} label="Enable notifications" />
          </div>
        </Section>

        {/* Progress */}
        <Section title="Progress Bar">
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "12px" }}>
            <ProgressBar value={30} showPct label="Registration" />
            <ProgressBar value={72} showPct label="Capacity" />
            <ProgressBar value={95} showPct label="Almost full" />
          </div>
        </Section>

        {/* Avatars & Chips */}
        <Section title="Avatar">
          <Avatar name="Kalyan Poguru" size={40} />
          <Avatar name="Alice Smith" src={null} size={40} />
          <AvatarGroup avatars={[{ name: "Alice" }, { name: "Bob" }, { name: "Charlie" }, { name: "Diana" }, { name: "Eve" }]} max={3} />
        </Section>

        <Section title="Chip">
          <Chip label="5K Run" icon="🏃" />
          <Chip label="Kondapur" color={color.info} />
          <Chip label="Removable" onRemove={() => {}} />
        </Section>

        {/* Stat Card */}
        <Section title="Stat Card">
          <StatCard label="Total Members"  value="177" delta={{ value: "12%", positive: true }}  icon="👥" style={{ minWidth: 160 }} />
          <StatCard label="Revenue"        value="₹8.9K" sub="This month" icon="💰" color={color.orange} style={{ minWidth: 160 }} />
          <StatCard label="Sessions"       value="19" delta={{ value: "3", positive: false }} icon="📍" color={color.info} style={{ minWidth: 160 }} />
        </Section>

        {/* Timeline */}
        <Section title="Timeline">
          <Timeline items={[
            { icon: "📝", title: "Registered",        time: "10:02 AM", detail: "5K Run · ₹99" },
            { icon: "💳", title: "Payment Confirmed", time: "10:03 AM", color: color.success },
            { icon: "🎫", title: "QR Code Generated", time: "10:03 AM" },
            { icon: "✅", title: "Checked In",        time: "6:14 AM",  color: color.success, detail: "Race day" },
          ]} style={{ minWidth: 280 }} />
        </Section>

        {/* Navigation */}
        <Section title="Tabs">
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "16px" }}>
            <Tabs tabs={[{ key: "overview", label: "Overview", count: 4 }, { key: "registrations", label: "Registrations" }, { key: "analytics", label: "Analytics" }]} active={tab} onChange={setTab} />
            <Tabs tabs={[{ key: "overview", label: "Overview" }, { key: "registrations", label: "Registrations" }, { key: "analytics", label: "Analytics" }]} active={tab} onChange={setTab} variant="pill" />
          </div>
        </Section>

        <Section title="Segmented Control">
          <SegmentedControl segments={[{ key: "list", label: "List", icon: "≡" }, { key: "grid", label: "Grid", icon: "⊞" }]} value={seg} onChange={setSeg} />
        </Section>

        <Section title="Pagination">
          <Pagination page={page} totalPages={12} onChange={setPage} />
        </Section>

        <Section title="Stepper">
          <Stepper steps={[{ label: "Details", description: "Fill basic info" }, { label: "Races" }, { label: "Settings" }, { label: "Publish" }]} current={step} style={{ width: "100%", maxWidth: "480px" }} />
          <div style={{ display: "flex", gap: "8px" }}>
            <Button size="sm" variant="secondary" onClick={() => setStep(s => Math.max(0, s - 1))}>← Back</Button>
            <Button size="sm" onClick={() => setStep(s => Math.min(3, s + 1))}>Next →</Button>
          </div>
        </Section>

        <Section title="Breadcrumbs">
          <Breadcrumbs items={[{ label: "Admin", href: "/admin" }, { label: "Events", href: "/admin/events" }, { label: "June Run" }]} />
        </Section>

        {/* Overlays */}
        <Section title="Modal & Drawer">
          <Button onClick={() => setModal(true)}>Open Modal</Button>
          <Button variant="secondary" onClick={() => setConfirm(true)}>Confirm Dialog</Button>
          <Button variant="outline" onClick={() => setDrawer(true)}>Open Drawer</Button>
        </Section>

        <Modal open={modal} onClose={() => setModal(false)} title="Example Modal"
          footer={<><Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button><Button onClick={() => setModal(false)}>Confirm</Button></>}>
          <Text>This is the modal body. It supports any content.</Text>
        </Modal>

        <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => setConfirm(false)}
          title="Delete Session?" message="This will permanently delete the session and all attendance records. This cannot be undone." confirmLabel="Delete" danger />

        <Drawer open={drawer} onClose={() => setDrawer(false)} title="Drawer Panel">
          <Text>Drawer content goes here. It slides in from the right.</Text>
        </Drawer>

        {/* StatStrip */}
        <Section title="Stat Strip">
          <StatStrip stats={[{ label: "Members", value: 177, color: color.success }, { label: "Sessions", value: 19 }, { label: "Revenue", value: "₹8.9K", color: color.orange }]} />
        </Section>

      </Container>
    </div>
  );
}
