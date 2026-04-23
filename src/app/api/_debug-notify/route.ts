// TEMPORARY: diagnostic endpoint. Returns presence flags only, no values.
// Delete after verifying notification setup.
export const runtime = "nodejs";

export async function GET() {
  const resendKey = process.env.RESEND_API_KEY;
  const adminEmail = process.env.ADMIN_EMAIL;
  return Response.json({
    resendKeyPresent: Boolean(resendKey),
    resendKeyLength: resendKey?.length ?? 0,
    resendKeyPrefix: resendKey ? resendKey.slice(0, 3) : null,
    adminEmailPresent: Boolean(adminEmail),
    adminEmailDomain: adminEmail ? adminEmail.split("@")[1] : null,
  });
}
