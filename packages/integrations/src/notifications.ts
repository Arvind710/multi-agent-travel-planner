import { loadEnv } from "@raah/shared/env";

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const env = loadEnv();
  if (!env.AUTH_RESEND_KEY) {
    console.warn("AUTH_RESEND_KEY not set. Email not sent.");
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.AUTH_RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to,
        subject,
        html,
      }),
    });

    if (!res.ok) {
      console.error("Failed to send email via Resend", await res.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error sending email:", error);
    return false;
  }
}

export function generateWhatsAppSummary(tripName: string, shareUrl: string): string {
  return `Hey! Check out this itinerary for ${tripName} I planned using Raah: ${shareUrl}`;
}
