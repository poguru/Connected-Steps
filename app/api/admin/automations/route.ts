import { NextRequest, NextResponse } from "next/server";
import { getOrgContext, canAccessOrg, writeOrgAudit, actorEmail } from "@/lib/org-auth";
import { getSupabaseServer } from "@/lib/supabase-server";
import type { AutomationTrigger, AutomationCondition, AutomationAction, ConditionOperator } from "@/lib/automation-engine";

const VALID_TRIGGERS: AutomationTrigger[] = [
  "payment.succeeded", "payment.failed", "registration.created", "registration.cancelled",
  "participant.checked_in", "certificate.generated", "refund.completed", "membership.renewed",
  "waitlist.promoted", "registration_capacity.90_percent", "merchandise_stock.low",
];

const VALID_OPERATORS: ConditionOperator[] = ["eq", "neq", "gt", "lt", "contains", "not_contains"];

export async function GET(req: NextRequest) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url    = new URL(req.url);
  const org_id = url.searchParams.get("org_id") ?? ctx.org_id;
  if (!org_id) return NextResponse.json({ error: "org_id required" }, { status: 400 });
  if (!canAccessOrg(ctx, org_id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("automation_rules")
    .select("id, name, description, trigger_event, conditions, actions, is_active, created_by, created_at, updated_at")
    .eq("organization_id", org_id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: "Failed to fetch automations" }, { status: 500 });

  return NextResponse.json({
    data: data ?? [],
    available_triggers: VALID_TRIGGERS,
    available_operators: VALID_OPERATORS,
  });
}

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    org_id:        string;
    name:          string;
    description?:  string;
    trigger_event: AutomationTrigger;
    conditions:    AutomationCondition[];
    actions:       AutomationAction[];
    is_active?:    boolean;
  };

  if (!body.org_id || !body.name || !body.trigger_event || !body.actions?.length) {
    return NextResponse.json({ error: "org_id, name, trigger_event, and actions are required" }, { status: 400 });
  }
  if (!canAccessOrg(ctx, body.org_id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!(VALID_TRIGGERS as string[]).includes(body.trigger_event)) {
    return NextResponse.json({ error: `Invalid trigger_event: ${body.trigger_event}` }, { status: 400 });
  }

  for (const c of (body.conditions ?? [])) {
    if (!(VALID_OPERATORS as string[]).includes(c.operator)) {
      return NextResponse.json({ error: `Invalid condition operator: ${c.operator}` }, { status: 400 });
    }
  }

  const db = getSupabaseServer();
  const { data, error } = await db
    .from("automation_rules")
    .insert({
      organization_id: body.org_id,
      name:            body.name,
      description:     body.description ?? null,
      trigger_event:   body.trigger_event,
      conditions:      body.conditions ?? [],
      actions:         body.actions,
      is_active:       body.is_active ?? true,
      created_by:      actorEmail(ctx),
    })
    .select("id, name, trigger_event, conditions, actions, is_active, created_at")
    .single();

  if (error) return NextResponse.json({ error: "Failed to create automation" }, { status: 500 });

  await writeOrgAudit({
    organization_id: body.org_id,
    action:          "automation.created",
    actor_email:     actorEmail(ctx),
    resource_type:   "automation_rule",
    resource_id:     (data as { id: string }).id,
    detail:          { name: body.name, trigger: body.trigger_event },
  });

  return NextResponse.json({ data }, { status: 201 });
}
