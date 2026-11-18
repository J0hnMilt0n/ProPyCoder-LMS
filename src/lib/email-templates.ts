import "server-only";

export type EmailTemplateType =
  | "password-reset"
  | "email-verification"
  | "announcement"
  | "instructor-recruitment";

export interface EmailTemplateResult {
  subject: string;
  htmlContent: string;
  textContent: string;
  previewUrl: string;
  templateType: EmailTemplateType;
}

export interface EmailTemplateInput {
  templateType: EmailTemplateType;
  data: Record<string, any>;
  customSubject?: string;
  customHtml?: string;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c),
  );
}

export function generateEmailTemplate(input: EmailTemplateInput): EmailTemplateResult {
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const origin = new URL(baseUrl);
  const logoUrl = new URL("/propycoder-logo.png", origin).toString();

  switch (input.templateType) {
    case "password-reset":
      return generatePasswordResetTemplate(input.data, origin, logoUrl, input.customSubject, input.customHtml);
    case "email-verification":
      return generateEmailVerificationTemplate(input.data, origin, logoUrl, input.customSubject, input.customHtml);
    case "announcement":
      return generateAnnouncementTemplate(input.data, origin, logoUrl, input.customSubject, input.customHtml);
        case "instructor-recruitment":
          return generateInstructorRecruitmentTemplate(input.data, origin, logoUrl, input.customSubject, input.customHtml);
    default:
      throw new Error(`Unknown template type: ${input.templateType}`);
  }
}

function generatePasswordResetTemplate(
  data: Record<string, any>,
  origin: URL,
  logoUrl: string,
  customSubject?: string,
  customHtml?: string,
): EmailTemplateResult {
  const firstName = data.firstName || "User";
  const resetUrl = data.resetUrl || new URL("/auth/reset-password", origin).toString();
  const subject = customSubject || "Reset your ProPyCoder password";
  const safeName = escapeHtml(firstName);
  const safeUrl = escapeHtml(resetUrl);
  const safeLogoUrl = escapeHtml(logoUrl);

  const htmlContent = customHtml || `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <style>
    @media only screen and (max-width:480px) {
      .email-card-content { padding:28px 22px 26px !important; }
      .email-heading { font-size:25px !important; }
    }
  </style>
  <title>ProPyCoder - Reset your password</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f3f1;font-family:Arial,Helvetica,sans-serif;color:#252525;-webkit-text-size-adjust:100%;">
  <div style="display:none!important;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">Reset your ProPyCoder password. Your secure link is ready inside.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f4f3f1" style="background-color:#f4f3f1;">
    <tr><td align="center" style="padding:38px 14px 30px;">
      <table role="presentation" width="520" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:520px;">
        <tr><td align="center" style="padding:0 0 23px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
            <td valign="middle"><a href="${escapeHtml(origin.toString())}" style="display:block;text-decoration:none;"><img src="${safeLogoUrl}" width="38" height="38" alt="ProPyCoder" style="display:block;width:38px;height:38px;border:0;"></a></td>
            <td valign="middle" style="padding-left:9px;"><a href="${escapeHtml(origin.toString())}" style="color:#292929;font-size:19px;font-weight:700;letter-spacing:-.3px;text-decoration:none;">ProPyCoder</a></td>
          </tr></table>
        </td></tr>
        <tr><td bgcolor="#ffffff" style="border:1px solid #e8e6e2;border-radius:10px;background-color:#ffffff;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr><td style="height:4px;border-radius:10px 10px 0 0;background:#f15a2a;font-size:0;line-height:0;">&nbsp;</td></tr>
            <tr><td class="email-card-content" style="padding:38px 40px 34px;">
              <p style="margin:0 0 12px;color:#b84c2b;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">PASSWORD RESET</p>
              <p style="margin:0 0 9px;color:#333;font-size:15px;line-height:1.6;">Hi ${safeName},</p>
              <p style="margin:0 0 27px;color:#626262;font-size:15px;line-height:1.75;">We received a request to reset your ProPyCoder password. Click the button below to choose a new one.</p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px;">
                <tr><td align="center" bgcolor="#e95725" style="border-radius:5px;background-color:#e95725;">
                  <a href="${safeUrl}" style="display:inline-block;padding:15px 25px;border:1px solid #e95725;border-radius:5px;color:#ffffff;font-size:14px;font-weight:700;line-height:1.2;text-decoration:none;">Reset my password&nbsp; &#8594;</a>
                </td></tr>
              </table>
              <p style="margin:0 0 25px;color:#858585;font-size:12px;line-height:1.6;">For your security, this one-time link expires in <strong style="color:#555555;">30 minutes</strong>.</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="height:1px;background-color:#ecebe8;font-size:0;line-height:0;">&nbsp;</td></tr></table>
              <p style="margin:19px 0 6px;color:#777777;font-size:12px;line-height:1.6;">If the button doesn't work, paste this link into your browser:</p>
              <p style="margin:0 0 20px;word-break:break-all;font-size:12px;line-height:1.6;"><a href="${safeUrl}" style="color:#a94325;text-decoration:underline;">${safeUrl}</a></p>
              <p style="margin:0;color:#777777;font-size:12px;line-height:1.65;">Didn't request a password reset? You can safely ignore this email.</p>
            </td></tr>
            <tr><td align="center" style="padding:19px 24px 20px;border-top:1px solid #ecebe8;background-color:#faf9f7;">
              <p style="margin:0 0 6px;color:#555555;font-size:12px;font-weight:700;line-height:1.6;">Practical skills. Real projects. Your next chapter.</p>
              <p style="margin:0;color:#777777;font-size:11px;line-height:1.6;">Need help? <a href="mailto:support@propycoder.com" style="color:#a94325;text-decoration:underline;">support@propycoder.com</a></p>
              <p style="margin:8px 0 0;color:#858585;font-size:10px;line-height:1.5;">© ProPyCoder · This is an account-related message.</p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding:12px 18px 0;color:#888888;font-size:10px;line-height:1.55;">You're receiving this because a password reset was requested for this email address.</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const textContent = `Hi ${firstName},

We received a request to reset your ProPyCoder password.

Click the link below to choose a new password:
${resetUrl}

This secure link expires in 30 minutes and can only be used once.
If you did not request a password reset, you can safely ignore this email.

Practical skills. Real projects. Your next chapter.
Need help? support@propycoder.com
© ProPyCoder · This is an account-related message.`;

  return { subject, htmlContent, textContent, previewUrl: resetUrl, templateType: "password-reset" };
}

function generateEmailVerificationTemplate(
  data: Record<string, any>,
  origin: URL,
  logoUrl: string,
  customSubject?: string,
  customHtml?: string,
): EmailTemplateResult {
  const firstName = data.firstName || "User";
  const verifyUrl = data.verifyUrl || new URL("/auth/verify-email", origin).toString();
  const subject = customSubject || "Verify your ProPyCoder email address";
  const safeName = escapeHtml(firstName);
  const safeUrl = escapeHtml(verifyUrl);
  const safeLogoUrl = escapeHtml(logoUrl);

  const htmlContent = customHtml || `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <style>
    @media only screen and (max-width:480px) {
      .email-card-content { padding:28px 22px 26px !important; }
      .email-heading { font-size:25px !important; }
    }
  </style>
  <title>ProPyCoder - Confirm your email</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f3f1;font-family:Arial,Helvetica,sans-serif;color:#252525;-webkit-text-size-adjust:100%;">
  <div style="display:none!important;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">One quick step to activate your ProPyCoder account. Your confirmation link is ready inside.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f4f3f1" style="background-color:#f4f3f1;">
    <tr><td align="center" style="padding:38px 14px 30px;">
      <table role="presentation" width="520" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:520px;">
        <tr><td align="center" style="padding:0 0 23px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
            <td valign="middle"><a href="${escapeHtml(origin.toString())}" style="display:block;text-decoration:none;"><img src="${safeLogoUrl}" width="38" height="38" alt="ProPyCoder" style="display:block;width:38px;height:38px;border:0;"></a></td>
            <td valign="middle" style="padding-left:9px;"><a href="${escapeHtml(origin.toString())}" style="color:#292929;font-size:19px;font-weight:700;letter-spacing:-.3px;text-decoration:none;">ProPyCoder</a></td>
          </tr></table>
        </td></tr>
        <tr><td bgcolor="#ffffff" style="border:1px solid #e8e6e2;border-radius:10px;background-color:#ffffff;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr><td style="height:4px;border-radius:10px 10px 0 0;background:#f15a2a;font-size:0;line-height:0;">&nbsp;</td></tr>
            <tr><td class="email-card-content" style="padding:38px 40px 34px;">
              <p style="margin:0 0 12px;color:#b84c2b;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">WELCOME TO PROPYCODER</p>
              <h1 class="email-heading" style="margin:0 0 20px;color:#242424;font-size:30px;font-weight:700;line-height:1.18;letter-spacing:-.7px;">You're almost in.</h1>
              <p style="margin:0 0 9px;color:#333;font-size:15px;line-height:1.6;">Hi ${safeName},</p>
              <p style="margin:0 0 27px;color:#626262;font-size:15px;line-height:1.75;">One quick confirmation and your ProPyCoder account is ready. Verify your email to get started.</p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px;">
                <tr><td align="center" bgcolor="#e95725" style="border-radius:5px;background-color:#e95725;">
                  <a href="${safeUrl}" style="display:inline-block;padding:15px 25px;border:1px solid #e95725;border-radius:5px;color:#ffffff;font-size:14px;font-weight:700;line-height:1.2;text-decoration:none;">Verify my email&nbsp; &#8594;</a>
                </td></tr>
              </table>
              <p style="margin:0 0 25px;color:#858585;font-size:12px;line-height:1.6;">For your security, this one-time link expires in <strong style="color:#555555;">30 minutes</strong>.</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="height:1px;background-color:#ecebe8;font-size:0;line-height:0;">&nbsp;</td></tr></table>
              <p style="margin:19px 0 6px;color:#777777;font-size:12px;line-height:1.6;">If the button doesn't work, paste this link into your browser:</p>
              <p style="margin:0 0 20px;word-break:break-all;font-size:12px;line-height:1.6;"><a href="${safeUrl}" style="color:#a94325;text-decoration:underline;">${safeUrl}</a></p>
              <p style="margin:0;color:#777777;font-size:12px;line-height:1.65;">Didn't sign up for ProPyCoder? You can safely ignore this message.</p>
            </td></tr>
            <tr><td align="center" style="padding:19px 24px 20px;border-top:1px solid #ecebe8;background-color:#faf9f7;">
              <p style="margin:0 0 6px;color:#555555;font-size:12px;font-weight:700;line-height:1.6;">Practical skills. Real projects. Your next chapter.</p>
              <p style="margin:0;color:#777777;font-size:11px;line-height:1.6;">Need help? <a href="mailto:support@propycoder.com" style="color:#a94325;text-decoration:underline;">support@propycoder.com</a></p>
              <p style="margin:8px 0 0;color:#858585;font-size:10px;line-height:1.5;">© ProPyCoder · This is an account-related message.</p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding:12px 18px 0;color:#888888;font-size:10px;line-height:1.55;">You're receiving this because an account was created using this email address.</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const textContent = `Hi ${firstName},

Welcome to ProPyCoder.

You're almost ready to learn by building. Confirm your email address to activate your account:
${verifyUrl}

This secure link expires in 30 minutes and can only be used once.
If you did not create a ProPyCoder account, you can safely ignore this email.

Practical skills. Real projects. Your next chapter.
Need help? support@propycoder.com
© ProPyCoder · This is an account-related message.
You're receiving this because an account was created using this email address.`;

  return { subject, htmlContent, textContent, previewUrl: verifyUrl, templateType: "email-verification" };
}

function generateAnnouncementTemplate(
  data: Record<string, any>,
  origin: URL,
  logoUrl: string,
  customSubject?: string,
  customHtml?: string,
): EmailTemplateResult {
  const title = data.title || "New Announcement";
  const message = data.message || "This is a test announcement.";
  const link = data.link || "";
  const subject = customSubject || title;
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const safeLogoUrl = escapeHtml(logoUrl);

  const htmlContent = customHtml || `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <style>
    @media only screen and (max-width:480px) {
      .email-card-content { padding:28px 22px 26px !important; }
      .email-heading { font-size:25px !important; }
    }
  </style>
  <title>ProPyCoder - ${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f3f1;font-family:Arial,Helvetica,sans-serif;color:#252525;-webkit-text-size-adjust:100%;">
  <div style="display:none!important;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${safeTitle}. ${safeMessage.substring(0, 100)}...</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f4f3f1" style="background-color:#f4f3f1;">
    <tr><td align="center" style="padding:38px 14px 30px;">
      <table role="presentation" width="520" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:520px;">
        <tr><td align="center" style="padding:0 0 23px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
            <td valign="middle"><a href="${escapeHtml(origin.toString())}" style="display:block;text-decoration:none;"><img src="${safeLogoUrl}" width="38" height="38" alt="ProPyCoder" style="display:block;width:38px;height:38px;border:0;"></a></td>
            <td valign="middle" style="padding-left:9px;"><a href="${escapeHtml(origin.toString())}" style="color:#292929;font-size:19px;font-weight:700;letter-spacing:-.3px;text-decoration:none;">ProPyCoder</a></td>
          </tr></table>
        </td></tr>
        <tr><td bgcolor="#ffffff" style="border:1px solid #e8e6e2;border-radius:10px;background-color:#ffffff;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr><td style="height:4px;border-radius:10px 10px 0 0;background:#f15a2a;font-size:0;line-height:0;">&nbsp;</td></tr>
            <tr><td class="email-card-content" style="padding:38px 40px 34px;">
              <p style="margin:0 0 12px;color:#b84c2b;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">ANNOUNCEMENT</p>
              <h1 class="email-heading" style="margin:0 0 20px;color:#242424;font-size:30px;font-weight:700;line-height:1.18;letter-spacing:-.7px;">${safeTitle}</h1>
              <div style="margin:0 0 27px;color:#626262;font-size:15px;line-height:1.75;">${safeMessage}</div>
              ${link ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px;">
                <tr><td align="center" bgcolor="#e95725" style="border-radius:5px;background-color:#e95725;">
                  <a href="${escapeHtml(link)}" style="display:inline-block;padding:15px 25px;border:1px solid #e95725;border-radius:5px;color:#ffffff;font-size:14px;font-weight:700;line-height:1.2;text-decoration:none;">View details&nbsp; &#8594;</a>
                </td></tr>
              </table>` : ""}
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="height:1px;background-color:#ecebe8;font-size:0;line-height:0;">&nbsp;</td></tr></table>
              <p style="margin:19px 0 6px;color:#777777;font-size:12px;line-height:1.6;">© ProPyCoder · This is an account-related message.</p>
            </td></tr>
            <tr><td align="center" style="padding:19px 24px 20px;border-top:1px solid #ecebe8;background-color:#faf9f7;">
              <p style="margin:0 0 6px;color:#555555;font-size:12px;font-weight:700;line-height:1.6;">Practical skills. Real projects. Your next chapter.</p>
              <p style="margin:0;color:#777777;font-size:11px;line-height:1.6;">Need help? <a href="mailto:support@propycoder.com" style="color:#a94325;text-decoration:underline;">support@propycoder.com</a></p>
              <p style="margin:8px 0 0;color:#858585;font-size:10px;line-height:1.5;">© ProPyCoder · This is an account-related message.</p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding:12px 18px 0;color:#888888;font-size:10px;line-height:1.55;">You're receiving this because you are an active ProPyCoder user.</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const textContent = `${title}

${message}

© ProPyCoder · This is an account-related message.`;

  return { subject, htmlContent, textContent, previewUrl: link || new URL("/", origin).toString(), templateType: "announcement" };
}

function generateInstructorRecruitmentTemplate(
  data: Record<string, any>,
  origin: URL,
  logoUrl: string,
  customSubject?: string,
  customHtml?: string,
): EmailTemplateResult {
  const firstName = data.firstName || "there";
  const subject =
    customSubject || "We'd love to have you teach on ProPyCoder";
  const safeName = escapeHtml(firstName);
  const safeLogoUrl = escapeHtml(logoUrl);
  const applyUrl = new URL("/instructor", origin).toString();
  const safeApplyUrl = escapeHtml(applyUrl);

  const htmlContent = customHtml || `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <style>
    @media only screen and (max-width:480px) {
      .email-card-content { padding:28px 22px 26px !important; }
      .email-heading { font-size:25px !important; }
    }
  </style>
  <title>ProPyCoder - Teach with us</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f3f1;font-family:Arial,Helvetica,sans-serif;color:#252525;-webkit-text-size-adjust:100%;">
  <div style="display:none!important;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">We're growing our instructor team and think you'd be a great fit. See the role inside.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f4f3f1" style="background-color:#f4f3f1;">
    <tr><td align="center" style="padding:38px 14px 30px;">
      <table role="presentation" width="520" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:520px;">
        <tr><td align="center" style="padding:0 0 23px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
            <td valign="middle"><a href="${escapeHtml(origin.toString())}" style="display:block;text-decoration:none;"><img src="${safeLogoUrl}" width="38" height="38" alt="ProPyCoder" style="display:block;width:38px;height:38px;border:0;"></a></td>
            <td valign="middle" style="padding-left:9px;"><a href="${escapeHtml(origin.toString())}" style="color:#292929;font-size:19px;font-weight:700;letter-spacing:-.3px;text-decoration:none;">ProPyCoder</a></td>
          </tr></table>
        </td></tr>
        <tr><td bgcolor="#ffffff" style="border:1px solid #e8e6e2;border-radius:10px;background-color:#ffffff;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr><td style="height:4px;border-radius:10px 10px 0 0;background:#f15a2a;font-size:0;line-height:0;">&nbsp;</td></tr>
            <tr><td class="email-card-content" style="padding:38px 40px 34px;">
              <p style="margin:0 0 12px;color:#b84c2b;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">INSTRUCTOR OPPORTUNITY</p>
              <h1 class="email-heading" style="margin:0 0 20px;color:#242424;font-size:30px;font-weight:700;line-height:1.18;letter-spacing:-.7px;">Teach the next generation of Python builders.</h1>
              <p style="margin:0 0 9px;color:#333;font-size:15px;line-height:1.6;">Hi ${safeName},</p>
              <p style="margin:0 0 27px;color:#626262;font-size:15px;line-height:1.75;">We're growing the ProPyCoder instructor team, and based on your background we think you'd be a great fit. Our instructors lead project-based courses, mentor learners through real builds, and shape the curriculum alongside our team.</p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px;">
                <tr><td align="center" bgcolor="#e95725" style="border-radius:5px;background-color:#e95725;">
                  <a href="${safeApplyUrl}" style="display:inline-block;padding:15px 25px;border:1px solid #e95725;border-radius:5px;color:#ffffff;font-size:14px;font-weight:700;line-height:1.2;text-decoration:none;">Apply as an instructor&nbsp; &#8594;</a>
                </td></tr>
              </table>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="height:1px;background-color:#ecebe8;font-size:0;line-height:0;">&nbsp;</td></tr></table>
              <p style="margin:19px 0 6px;color:#777777;font-size:12px;line-height:1.6;">If the button doesn't work, paste this link into your browser:</p>
              <p style="margin:0 0 20px;word-break:break-all;font-size:12px;line-height:1.6;"><a href="${safeApplyUrl}" style="color:#a94325;text-decoration:underline;">${safeApplyUrl}</a></p>
              <p style="margin:0;color:#777777;font-size:12px;line-height:1.65;">Questions? Reply to this email and we'll get back to you.</p>
            </td></tr>
            <tr><td align="center" style="padding:19px 24px 20px;border-top:1px solid #ecebe8;background-color:#faf9f7;">
              <p style="margin:0 0 6px;color:#555555;font-size:12px;font-weight:700;line-height:1.6;">Practical skills. Real projects. Your next chapter.</p>
              <p style="margin:0;color:#777777;font-size:11px;line-height:1.6;">Need help? <a href="mailto:support@propycoder.com" style="color:#a94325;text-decoration:underline;">support@propycoder.com</a></p>
              <p style="margin:8px 0 0;color:#858585;font-size:10px;line-height:1.5;">© ProPyCoder</p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding:12px 18px 0;color:#888888;font-size:10px;line-height:1.55;">You're receiving this because we believe you'd be a great fit for our instructor team.</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const textContent = `Hi ${firstName},

We're growing the ProPyCoder instructor team, and based on your background we think you'd be a great fit.

Our instructors lead project-based courses, mentor learners through real builds, and shape the curriculum alongside our team.

Apply here:
${applyUrl}

Questions? Reply to this email and we'll get back to you.

Practical skills. Real projects. Your next chapter.
Need help? support@propycoder.com
© ProPyCoder`;

  return { subject, htmlContent, textContent, previewUrl: applyUrl, templateType: "instructor-recruitment" };
}
