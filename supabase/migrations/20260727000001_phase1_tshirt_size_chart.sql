-- Phase 1: T-Shirt Size Guide
-- Adds size chart image URL per event so admins can upload a chart
-- and participants see a "View Size Guide" popup on the registration page.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS tshirt_size_chart_url TEXT;
