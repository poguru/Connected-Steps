/**
 * Connected Steps Design System
 * Import everything from this barrel for stable, tree-shakeable import paths.
 *
 * Usage:
 *   import { Button, Card, Input, Badge, useToast } from '@/components/ui/ds'
 */

// ── Foundation ────────────────────────────────────────────────────────────────
export * from "./tokens";   // color, radius, shadow, font, transition, spacing,
                            // zIndex, breakpoint, iconSize, maxWidth
export * from "./motion";   // motion, hover, ease

// ── Atoms ─────────────────────────────────────────────────────────────────────
export * from "./Button";         // Button
export * from "./Badge";          // Badge, StatusBadge
export * from "./Typography";     // PageTitle, SectionTitle, Label, Text, Display

// ── Feedback / State ──────────────────────────────────────────────────────────
export * from "./Feedback";       // Alert, EmptyState, ErrorState, Spinner, LoadingState
export * from "./Skeleton";       // Skeleton, SkeletonCard, SkeletonTable
export * from "./Toast";          // ToastProvider, useToast (ToastVariant re-exported)

// ── Form controls ─────────────────────────────────────────────────────────────
export * from "./Form";           // Input, Textarea, Select, FormGroup, FormRow
export * from "./FormControls";   // Checkbox, Radio, Toggle, SearchInput, PasswordInput

// ── Data display ──────────────────────────────────────────────────────────────
export * from "./DataDisplay";    // ProgressBar, Avatar, AvatarGroup, Chip, Tooltip,
                                  // StatCard, Timeline

// ── Containers / Molecules ────────────────────────────────────────────────────
export * from "./Card";           // Card, CardHeader, CardBody, CardFooter
export * from "./Table";          // Table<T>
export * from "./Modal";          // Modal, ConfirmDialog
export * from "./Drawer";         // Drawer

// ── Navigation ────────────────────────────────────────────────────────────────
export * from "./Navigation";     // Breadcrumbs, Tabs, SegmentedControl,
                                  // Pagination, Stepper

// ── Layout primitives ─────────────────────────────────────────────────────────
export * from "./Layout";         // Page, PageHeader, Container, TwoCol,
                                  // Divider, SectionRow, StatStrip
export * from "./Layouts";        // StickyHeader, AuthLayout, PublicLayout,
                                  // DashboardLayout, AdminContent,
                                  // SettingsLayout, EventLayout
