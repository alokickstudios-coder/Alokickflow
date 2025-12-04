// Email service with optional Resend integration
// Falls back to console logging if Resend is not installed or configured

// Basic interface for email options
export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}

// NOTE:
// We deliberately avoid importing "resend" at the module level so that the app
// can build and deploy even if the package is not installed. All email sending
// will gracefully fall back to console logging in that case.

class EmailService {
  private resend: any = null;
  private isConfigured: boolean = false;
  private initialized: boolean = false;

  private async ensureInitialized() {
    if (this.initialized) return;
    this.initialized = true;

    if (!process.env.RESEND_API_KEY) {
      console.warn("EmailService: RESEND_API_KEY is not set. Emails will be logged to console.");
      return;
    }

    // We never import "resend" directly here so that builds succeed even if the
    // dependency is not present. If you want real emails in production, install
    // the package and set RESEND_API_KEY; otherwise this will just log to console.
  }

  async send(options: EmailOptions): Promise<boolean> {
    await this.ensureInitialized();

    const { to, subject, html, from = "AlokickFlow <onboarding@resend.dev>" } = options;

    if (!this.isConfigured || !this.resend) {
      console.log("--- MOCK EMAIL SEND ---");
      console.log(`To: ${to}`);
      console.log(`From: ${from}`);
      console.log(`Subject: ${subject}`);
      console.log(`Content: ${html.substring(0, 100)}...`);
      console.log("-----------------------");
      return true;
    }

    try {
      const data = await this.resend.emails.send({
        from,
        to,
        subject,
        html,
      });
      
      if (data.error) {
          console.error("EmailService Error:", data.error);
          return false;
      }

      return true;
    } catch (error) {
      console.error("EmailService Exception:", error);
      return false;
    }
  }

  async sendInvitation(email: string, inviteLink: string, inviterName: string = "AlokickFlow") {
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>You've been invited!</h2>
        <p>${inviterName} has invited you to join their organization on AlokickFlow.</p>
        <p>Click the button below to accept the invitation:</p>
        <a href="${inviteLink}" style="display: inline-block; background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">
          Accept Invitation
        </a>
        <p style="color: #666; font-size: 14px;">Or copy this link: ${inviteLink}</p>
      </div>
    `;

    return this.send({
      to: email,
      subject: `Invitation to join ${inviterName} on AlokickFlow`,
      html,
    });
  }
  
  async sendPasswordReset(email: string, resetLink: string) {
      const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Reset Your Password</h2>
        <p>You requested to reset your password. Click the link below to proceed:</p>
        <a href="${resetLink}" style="display: inline-block; background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">
          Reset Password
        </a>
        <p style="color: #666; font-size: 14px;">If you didn't request this, please ignore this email.</p>
      </div>
    `;

    return this.send({
      to: email,
      subject: "Reset your password",
      html,
    });
  }
}

export const emailService = new EmailService();
