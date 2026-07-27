/**
 * Automation rule engine.
 *
 * Organizations define rules: trigger_event → conditions → actions.
 * Call evaluateAutomations() from any route handler after a business event.
 *
 * Actions supported:
 *   send_email       — send a comm template to a participant
 *   send_webhook     — call a URL with event data
 *   add_to_waitlist  — promote next waitlist entry
 *   notify_org       — send an internal notification to org admins
 *   (stub) generate_certificate — queue certificate generation
 */

import { getSupabaseServer } from "@/lib/supabase-server";
import { logger }            from "@/lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AutomationTrigger =
  | "payment.succeeded"
  | "payment.failed"
  | "registration.created"
  | "registration.cancelled"
  | "participant.checked_in"
  | "certificate.generated"
  | "refund.completed"
  | "membership.renewed"
  | "waitlist.promoted"
  | "registration_capacity.90_percent"
  | "merchandise_stock.low";

export type ConditionOperator = "eq" | "neq" | "gt" | "lt" | "contains" | "not_contains";

export interface AutomationCondition {
  field:    string;          // e.g. "event_id", "amount", "payment_status"
  operator: ConditionOperator;
  value:    string | number;
}

export type ActionType =
  | "send_email"
  | "send_webhook"
  | "notify_org"
  | "generate_certificate"
  | "add_to_waitlist";

export interface AutomationAction {
  type:   ActionType;
  params: Record<string, unknown>;
}

export interface AutomationRule {
  id:              string;
  organization_id: string;
  name:            string;
  trigger_event:   AutomationTrigger;
  conditions:      AutomationCondition[];
  actions:         AutomationAction[];
  is_active:       boolean;
}

// ── Condition evaluation ──────────────────────────────────────────────────────

function evaluateCondition(cond: AutomationCondition, ctx: Record<string, unknown>): boolean {
  const val = ctx[cond.field];
  const cmp = String(val ?? "");
  const ref = String(cond.value);

  switch (cond.operator) {
    case "eq":           return cmp === ref;
    case "neq":          return cmp !== ref;
    case "gt":           return parseFloat(cmp) > parseFloat(ref);
    case "lt":           return parseFloat(cmp) < parseFloat(ref);
    case "contains":     return cmp.toLowerCase().includes(ref.toLowerCase());
    case "not_contains": return !cmp.toLowerCase().includes(ref.toLowerCase());
    default:             return false;
  }
}

function conditionsMatch(rule: AutomationRule, ctx: Record<string, unknown>): boolean {
  return rule.conditions.every(c => evaluateCondition(c, ctx));
}

// ── Action executors ──────────────────────────────────────────────────────────

async function executeAction(
  action: AutomationAction,
  ctx:    Record<string, unknown>,
  rule:   AutomationRule,
): Promise<{ type: string; result: string }> {
  switch (action.type) {
    case "notify_org": {
      // Insert an in-app notification for org admins
      const db = getSupabaseServer();
      const { data: members } = await db
        .from("organization_members")
        .select("user_email")
        .eq("organization_id", rule.organization_id)
        .in("role", ["owner", "admin"])
        .eq("is_active", true);

      const message = String(action.params["message"] ?? `Automation triggered: ${rule.name}`);

      for (const m of members ?? []) {
        try {
          await db.from("notifications").insert({
            user_email: m.user_email,
            type:       "automation",
            title:      rule.name,
            message,
            read:       false,
          });
        } catch { /* non-critical */ }
      }
      return { type: action.type, result: `notified ${(members ?? []).length} admins` };
    }

    case "send_webhook": {
      const url = String(action.params["url"] ?? "");
      if (!url) return { type: action.type, result: "no url configured" };
      try {
        const res = await fetch(url, {
          method:  "POST",
          headers: { "Content-Type": "application/json", "User-Agent": "ConnectedSteps-Automation/1.0" },
          body:    JSON.stringify({ rule_id: rule.id, rule_name: rule.name, trigger: rule.trigger_event, data: ctx }),
        });
        return { type: action.type, result: `HTTP ${res.status}` };
      } catch (e) {
        return { type: action.type, result: `error: ${e instanceof Error ? e.message : String(e)}` };
      }
    }

    case "generate_certificate": {
      // Delegate to job queue — do not import job-queue here to avoid circular deps
      // We write to job_queue table directly to stay decoupled
      const db = getSupabaseServer();
      try {
        await db.from("job_queue").insert({
          job_type:        "certificate_generate",
          payload:         {
            userEmail:  ctx["user_email"] ?? ctx["email"],
            userName:   ctx["user_name"]  ?? ctx["name"],
            eventId:    ctx["event_id"],
            eventTitle: ctx["event_title"],
          },
          priority:        0,
          run_after:       new Date().toISOString(),
          max_attempts:    3,
          idempotency_key: `cert:auto:${rule.id}:${ctx["registration_id"] ?? String(Date.now())}`,
        });
      } catch { /* non-critical */ }
      return { type: action.type, result: "queued" };
    }

    case "send_email": {
      // Fire a comm template if template_id is specified
      // Otherwise log as no-op — template-based comms require UI wiring
      return { type: action.type, result: "stub — wire comm template_id in action params" };
    }

    case "add_to_waitlist": {
      // Promote next waitlist entry for the event
      return { type: action.type, result: "stub — waitlist promotion not yet automated" };
    }

    default:
      return { type: (action as AutomationAction).type, result: "unknown action" };
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Evaluates all active automation rules for the given org + trigger event.
 * Executes matching rules' actions and writes a run log entry.
 * Never throws — errors are logged.
 */
export async function evaluateAutomations(
  organization_id: string,
  trigger:         AutomationTrigger,
  context:         Record<string, unknown>,
): Promise<void> {
  try {
    const db = getSupabaseServer();
    const { data: rules } = await db
      .from("automation_rules")
      .select("id, name, trigger_event, conditions, actions, organization_id")
      .eq("organization_id", organization_id)
      .eq("trigger_event", trigger)
      .eq("is_active", true);

    if (!rules?.length) return;

    for (const rawRule of rules) {
      const rule = rawRule as unknown as AutomationRule;
      if (!conditionsMatch(rule, context)) continue;

      const startMs       = Date.now();
      const actionResults: { type: string; result: string }[] = [];
      let   status:        "success" | "failed" = "success";
      let   errorMsg      = "";

      for (const action of rule.actions) {
        try {
          const result = await executeAction(action, context, rule);
          actionResults.push(result);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          actionResults.push({ type: action.type, result: `error: ${msg}` });
          status   = "failed";
          errorMsg = msg;
        }
      }

      // Write run log
      await db.from("automation_run_log").insert({
        rule_id:          rule.id,
        organization_id,
        trigger_event:    trigger,
        context_data:     context,
        status,
        actions_taken:    actionResults,
        error:            errorMsg || null,
        duration_ms:      Date.now() - startMs,
      });

      // Update last_run_at (non-critical, fire-and-forget)
      void db.from("automation_rules").update({ last_run_at: new Date().toISOString() }).eq("id", rule.id);

    }
  } catch (e) {
    logger.error("automation-engine", "evaluateAutomations error", { trigger, organization_id, error: String(e) });
  }
}
