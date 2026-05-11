import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken  = process.env.TWILIO_AUTH_TOKEN;
const fromWA     = process.env.TWILIO_WHATSAPP_FROM; // e.g. "whatsapp:+14155238886"
const fromSMS    = process.env.TWILIO_SMS_FROM;      // e.g. "+14155238886" (optional)

function getClient() {
  if (!accountSid || !authToken) throw new Error("Twilio credentials not configured.");
  return twilio(accountSid, authToken);
}

// Normalise Indian phone numbers → +91XXXXXXXXXX
function normalisePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.startsWith("+")) return phone;
  return `+${digits}`;
}

export interface NotifyResult {
  phone:   string;
  channel: "whatsapp" | "sms";
  ok:      boolean;
  error?:  string;
}

export async function sendWhatsApp(phone: string, message: string): Promise<NotifyResult> {
  const to = `whatsapp:${normalisePhone(phone)}`;
  try {
    await getClient().messages.create({ from: fromWA!, to, body: message });
    return { phone, channel: "whatsapp", ok: true };
  } catch (e: unknown) {
    return { phone, channel: "whatsapp", ok: false, error: String(e) };
  }
}

export async function sendSMS(phone: string, message: string): Promise<NotifyResult> {
  if (!fromSMS) return { phone, channel: "sms", ok: false, error: "SMS not configured." };
  const to = normalisePhone(phone);
  try {
    await getClient().messages.create({ from: fromSMS, to, body: message });
    return { phone, channel: "sms", ok: true };
  } catch (e: unknown) {
    return { phone, channel: "sms", ok: false, error: String(e) };
  }
}

export function sessionMessage(
  name: string,
  title: string,
  date: string,
  location: string
): string {
  const d = new Date(date);
  const formatted = d.toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return [
    `Hi ${name}! 🏃`,
    ``,
    `A new *Connected Steps* training session has been scheduled:`,
    ``,
    `📅 *Date:* ${formatted}`,
    `📍 *Location:* ${location}`,
    `🎯 *Session:* ${title}`,
    ``,
    `Join us and keep the streak going! 💪`,
    `👉 https://www.connectedsteps.in/weekend-run`,
    ``,
    `— Connected Steps Team`,
  ].join("\n");
}
