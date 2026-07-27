/**
 * Third-party connector interface.
 *
 * All connectors implement ConnectorAdapter. New connectors are registered
 * in CONNECTOR_REGISTRY — no changes to core logic required.
 *
 * Each connector's config is stored encrypted in connector_configs.config (JSONB).
 * The connector receives the decrypted config at runtime.
 */

// ── Connector types ───────────────────────────────────────────────────────────

export type ConnectorType =
  | "google_calendar"
  | "microsoft_365"
  | "hubspot"
  | "salesforce"
  | "quickbooks"
  | "zoho_books"
  | "mailchimp"
  | "sendgrid"
  | "strava"
  | "garmin"
  | "s3"
  | "google_drive";

// ── Base interface ────────────────────────────────────────────────────────────

export interface ConnectorCapability {
  /** Human-readable name for this connector action. */
  name:        string;
  description: string;
}

export interface ConnectorAdapter {
  type:         ConnectorType;
  displayName:  string;
  description:  string;
  capabilities: ConnectorCapability[];
  /**
   * Returns the fields that must be present in config (for UI validation).
   */
  configSchema(): ConnectorConfigField[];
  /**
   * Validates a config object. Returns null if valid, error string if not.
   */
  validateConfig(config: Record<string, string>): Promise<string | null>;
  /**
   * Test the connection. Throws if unreachable or auth fails.
   */
  testConnection(config: Record<string, string>): Promise<void>;
  /**
   * Returns a list of available actions this connector can perform.
   * Not all capabilities need to be implemented immediately.
   */
  executeAction?(
    action:  string,
    payload: Record<string, unknown>,
    config:  Record<string, string>,
  ): Promise<Record<string, unknown>>;
}

export interface ConnectorConfigField {
  key:         string;
  label:       string;
  type:        "text" | "password" | "url" | "select";
  required:    boolean;
  placeholder?: string;
  options?:    string[];
}

// ── Connector stubs ───────────────────────────────────────────────────────────

const googleCalendar: ConnectorAdapter = {
  type:        "google_calendar",
  displayName: "Google Calendar",
  description: "Sync events to Google Calendar for participants and organizers.",
  capabilities: [
    { name: "Export Event",      description: "Create a Google Calendar event from a CS event." },
    { name: "Update Event",      description: "Update a calendar event when the CS event changes." },
    { name: "Delete Event",      description: "Remove calendar event when CS event is cancelled." },
    { name: "Participant Invite", description: "Send calendar invites to registered participants." },
  ],
  configSchema: () => [
    { key: "client_id",     label: "OAuth Client ID",     type: "text",     required: true },
    { key: "client_secret", label: "OAuth Client Secret", type: "password", required: true },
    { key: "refresh_token", label: "OAuth Refresh Token", type: "password", required: true },
    { key: "calendar_id",   label: "Calendar ID",         type: "text",     required: false, placeholder: "primary" },
  ],
  validateConfig: async (cfg) => {
    if (!cfg["client_id"] || !cfg["client_secret"] || !cfg["refresh_token"]) {
      return "client_id, client_secret, and refresh_token are required.";
    }
    return null;
  },
  testConnection: async (_cfg) => {
    // In production: exchange refresh_token for access_token and call calendar API
    throw new Error("Google Calendar connector not yet implemented. Configure OAuth credentials to enable.");
  },
};

const hubspot: ConnectorAdapter = {
  type:        "hubspot",
  displayName: "HubSpot CRM",
  description: "Push participant data to HubSpot as contacts.",
  capabilities: [
    { name: "Sync Contact",  description: "Create or update a HubSpot contact for each registered participant." },
    { name: "Sync Deal",     description: "Create a deal in HubSpot when a paid registration occurs." },
  ],
  configSchema: () => [
    { key: "api_key",        label: "Private App Token",  type: "password", required: true },
    { key: "pipeline_id",    label: "Pipeline ID",        type: "text",     required: false },
    { key: "owner_id",       label: "Default Owner ID",   type: "text",     required: false },
  ],
  validateConfig: async (cfg) => (!cfg["api_key"] ? "Private App Token is required." : null),
  testConnection: async (_cfg) => {
    throw new Error("HubSpot connector not yet implemented.");
  },
};

const quickbooks: ConnectorAdapter = {
  type:        "quickbooks",
  displayName: "QuickBooks Online",
  description: "Export invoices and payments to QuickBooks for accounting.",
  capabilities: [
    { name: "Export Invoice", description: "Create a QuickBooks invoice from a CS invoice." },
    { name: "Record Payment", description: "Record a payment against a QuickBooks invoice." },
  ],
  configSchema: () => [
    { key: "client_id",      label: "Client ID",      type: "text",     required: true },
    { key: "client_secret",  label: "Client Secret",  type: "password", required: true },
    { key: "refresh_token",  label: "Refresh Token",  type: "password", required: true },
    { key: "realm_id",       label: "Realm ID",       type: "text",     required: true },
    { key: "sandbox",        label: "Environment",    type: "select",   required: true, options: ["production", "sandbox"] },
  ],
  validateConfig: async (cfg) => {
    if (!cfg["client_id"] || !cfg["client_secret"] || !cfg["refresh_token"] || !cfg["realm_id"]) {
      return "All QuickBooks fields are required.";
    }
    return null;
  },
  testConnection: async (_cfg) => {
    throw new Error("QuickBooks connector not yet implemented.");
  },
};

const mailchimp: ConnectorAdapter = {
  type:        "mailchimp",
  displayName: "Mailchimp",
  description: "Add event registrants to Mailchimp audience lists.",
  capabilities: [
    { name: "Subscribe Contact", description: "Add or update a subscriber in a Mailchimp list." },
    { name: "Tag Contact",       description: "Add event-specific tags to subscribers." },
    { name: "Unsubscribe",       description: "Process unsubscribes from CS in Mailchimp." },
  ],
  configSchema: () => [
    { key: "api_key",   label: "API Key",      type: "password", required: true },
    { key: "server",    label: "Server Prefix", type: "text",    required: true, placeholder: "us1" },
    { key: "list_id",   label: "Audience ID",  type: "text",    required: true },
  ],
  validateConfig: async (cfg) => (
    (!cfg["api_key"] || !cfg["server"] || !cfg["list_id"])
      ? "api_key, server prefix, and list_id are required."
      : null
  ),
  testConnection: async (_cfg) => {
    throw new Error("Mailchimp connector not yet implemented.");
  },
};

const strava: ConnectorAdapter = {
  type:        "strava",
  displayName: "Strava",
  description: "Pull participant activity data from Strava after events.",
  capabilities: [
    { name: "Verify Completion", description: "Check Strava activities to verify race completion." },
    { name: "Import Results",    description: "Import finish times from Strava segments." },
  ],
  configSchema: () => [
    { key: "client_id",     label: "App Client ID",     type: "text",     required: true },
    { key: "client_secret", label: "App Client Secret", type: "password", required: true },
  ],
  validateConfig: async (cfg) => (!cfg["client_id"] ? "Client ID is required." : null),
  testConnection: async (_cfg) => {
    throw new Error("Strava connector not yet implemented.");
  },
};

const s3: ConnectorAdapter = {
  type:        "s3",
  displayName: "Amazon S3 / R2",
  description: "Push exports, certificates, and invoices to an S3-compatible bucket.",
  capabilities: [
    { name: "Upload File",      description: "Upload any generated file to the bucket." },
    { name: "Sync Exports",     description: "Automatically push each bulk export to S3." },
    { name: "Sync Certificates", description: "Push generated certificates to S3." },
  ],
  configSchema: () => [
    { key: "endpoint",         label: "Endpoint URL",      type: "url",      required: false, placeholder: "https://s3.amazonaws.com" },
    { key: "access_key_id",    label: "Access Key ID",     type: "text",     required: true },
    { key: "secret_access_key", label: "Secret Access Key", type: "password", required: true },
    { key: "bucket",           label: "Bucket Name",       type: "text",     required: true },
    { key: "region",           label: "Region",            type: "text",     required: false, placeholder: "us-east-1" },
  ],
  validateConfig: async (cfg) => (
    (!cfg["access_key_id"] || !cfg["secret_access_key"] || !cfg["bucket"])
      ? "access_key_id, secret_access_key, and bucket are required."
      : null
  ),
  testConnection: async (_cfg) => {
    throw new Error("S3 connector not yet implemented.");
  },
};

// ── Registry ──────────────────────────────────────────────────────────────────

export const CONNECTOR_REGISTRY: Record<ConnectorType, ConnectorAdapter> = {
  google_calendar:  googleCalendar,
  microsoft_365:    { ...googleCalendar, type: "microsoft_365", displayName: "Microsoft 365 Calendar", description: "Sync events to Microsoft 365 calendar.", testConnection: async () => { throw new Error("Not implemented."); } },
  hubspot:          hubspot,
  salesforce:       { ...hubspot, type: "salesforce", displayName: "Salesforce CRM", description: "Push participant data to Salesforce.", testConnection: async () => { throw new Error("Not implemented."); } },
  quickbooks:       quickbooks,
  zoho_books:       { ...quickbooks, type: "zoho_books", displayName: "Zoho Books", description: "Export invoices to Zoho Books.", testConnection: async () => { throw new Error("Not implemented."); } },
  mailchimp:        mailchimp,
  sendgrid:         { ...mailchimp, type: "sendgrid", displayName: "SendGrid", description: "Sync contact lists with SendGrid.", testConnection: async () => { throw new Error("Not implemented."); } },
  strava:           strava,
  garmin:           { ...strava, type: "garmin", displayName: "Garmin Connect", description: "Pull activity data from Garmin Connect.", testConnection: async () => { throw new Error("Not implemented."); } },
  s3:               s3,
  google_drive:     { ...s3, type: "google_drive", displayName: "Google Drive", description: "Upload exports and certificates to Google Drive.", testConnection: async () => { throw new Error("Not implemented."); } },
};

export function getConnector(type: ConnectorType): ConnectorAdapter | null {
  return CONNECTOR_REGISTRY[type] ?? null;
}

export function listConnectors(): { type: ConnectorType; displayName: string; description: string; capabilities: ConnectorCapability[] }[] {
  return Object.values(CONNECTOR_REGISTRY).map(c => ({
    type:         c.type,
    displayName:  c.displayName,
    description:  c.description,
    capabilities: c.capabilities,
  }));
}
