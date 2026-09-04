// Outbound email through Resend's REST API. No SDK, just fetch.
// Needs RESEND_API_KEY and MAIL_FROM. Without them, sends are skipped and the
// reason is returned so the admin page can show it.

const SITE = 'https://friendslop.wtf';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function players(p) {
  if (!p) return '';
  return p.min === p.max ? `${p.min} players` : `${p.min}–${p.max} players`;
}

export function approvalEmail(record) {
  const who = record.onBehalf && record.credit ? record.credit : record.devName;
  const subject = `${record.title} is up on friendslop.wtf`;
  const listing = `${SITE}/#games`;

  const text = [
    `Hi ${record.devName},`,
    ``,
    `${record.title} is live on the front page of friendslop.wtf.`,
    ``,
    `See it here: ${listing}`,
    `It links to: ${record.url}`,
    ``,
    `Listed as: ${players(record.players)} · by ${who}${record.tags && record.tags.length ? ' · ' + record.tags.join(', ') : ''}`,
    ``,
    `People will find it, grab a crew, and tell you what broke. That's the whole point.`,
    ``,
    `If anything about the listing is wrong (cover, blurb, link, credit), reply to this email and we'll fix it.`,
    ``,
    `— friendslop.wtf`,
    ``,
    `You're getting this because this address was given as the contact when the game was submitted${record.submittedAt ? ' on ' + record.submittedAt.slice(0, 10) : ''}. Submission id ${record.id}.`
  ].join('\n');

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f3ecff;font-family:'Comic Sans MS','Comic Neue','Chalkboard SE',cursive,sans-serif;color:#0d0316;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:6px double #1b0630;padding:22px;">
    <div style="display:inline-block;background:#7a1fff;color:#fff;font-weight:900;padding:4px 10px;border:3px solid #1b0630;">Slop approved™</div>
    <h1 style="font-size:26px;margin:14px 0 6px;">${esc(record.title)} is up.</h1>
    <p style="font-size:16px;line-height:1.5;margin:0 0 12px;">Hi ${esc(record.devName)}, your game is live on the front page of <a href="${listing}" style="color:#7a1fff;font-weight:700;">friendslop.wtf</a>.</p>
    <p style="font-size:15px;line-height:1.5;margin:0 0 12px;background:#e4ff8a;border:3px dashed #1b0630;padding:10px;">
      Listed as: <b>${esc(players(record.players))}</b> · by <b>${esc(who)}</b>${record.tags && record.tags.length ? ' · ' + esc(record.tags.join(', ')) : ''}<br>
      Links to: <a href="${esc(record.url)}" style="color:#7a1fff;">${esc(record.url)}</a>
    </p>
    <p style="font-size:16px;line-height:1.5;margin:0 0 12px;">People will find it, grab a crew, and tell you what broke. That's the whole point.</p>
    <p style="font-size:15px;line-height:1.5;margin:0 0 18px;">If anything about the listing is wrong (cover, blurb, link, credit), reply to this email and we'll fix it.</p>
    <a href="${listing}" style="display:inline-block;background:#c6ff00;color:#0d0316;font-weight:900;text-decoration:none;padding:10px 16px;border:4px solid #1b0630;text-transform:uppercase;letter-spacing:1px;">See it live</a>
    <p style="font-size:12px;color:#3a2a4a;margin:22px 0 0;line-height:1.4;">You're getting this because this address was given as the contact when the game was submitted${record.submittedAt ? ' on ' + esc(record.submittedAt.slice(0, 10)) : ''}. Submission id ${esc(record.id)}.</p>
  </div>
</body></html>`;

  return { subject, text, html };
}

export function mailEnabled() {
  return !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

function shell(badge, title, bodyHtml, buttonText, buttonHref, footer) {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f3ecff;font-family:'Comic Sans MS','Comic Neue','Chalkboard SE',cursive,sans-serif;color:#0d0316;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:6px double #1b0630;padding:22px;">
    <div style="display:inline-block;background:#7a1fff;color:#fff;font-weight:900;padding:4px 10px;border:3px solid #1b0630;">${esc(badge)}</div>
    <h1 style="font-size:26px;margin:14px 0 6px;">${esc(title)}</h1>
    ${bodyHtml}
    <a href="${esc(buttonHref)}" style="display:inline-block;background:#c6ff00;color:#0d0316;font-weight:900;text-decoration:none;padding:10px 16px;border:4px solid #1b0630;text-transform:uppercase;letter-spacing:1px;">${esc(buttonText)}</a>
    <p style="font-size:12px;color:#3a2a4a;margin:22px 0 0;line-height:1.4;">${esc(footer)}</p>
  </div>
</body></html>`;
}

export function verificationEmail(user, link) {
  const subject = 'Verify your friendslop.wtf email';
  const text = [
    `Hi ${user.name},`,
    ``,
    `Tap this to verify your email and unlock posting on friendslop.wtf:`,
    link,
    ``,
    `The link works for 24 hours. If you didn't make an account, ignore this and nothing happens.`,
    ``,
    `— friendslop.wtf`
  ].join('\n');
  const html = shell('Verify™', 'One click and you\'re in.', `<p style="font-size:16px;line-height:1.5;margin:0 0 18px;">Hi ${esc(user.name)}, verify your email to unlock posting games and crew calls on friendslop.wtf.</p>`, 'Verify my email', link, "The link works for 24 hours. If you didn't make an account, ignore this and nothing happens.");
  return { subject, text, html };
}

export function resetEmail(user, link) {
  const subject = 'Reset your friendslop.wtf password';
  const text = [
    `Hi ${user.name},`,
    ``,
    `Somebody asked to reset the password for this account. If it was you, use this link within the hour:`,
    link,
    ``,
    `If it wasn't you, ignore this. Your password stays the same.`,
    ``,
    `— friendslop.wtf`
  ].join('\n');
  const html = shell('Reset™', 'Forgot it? Happens.', `<p style="font-size:16px;line-height:1.5;margin:0 0 18px;">Hi ${esc(user.name)}, somebody asked to reset the password on this account. If that was you, the button below works for one hour.</p>`, 'Set a new password', link, "If it wasn't you, ignore this. Your password stays the same.");
  return { subject, text, html };
}

export async function sendMail({ to, subject, text, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!apiKey) return { sent: false, error: 'RESEND_API_KEY is not set' };
  if (!from) return { sent: false, error: 'MAIL_FROM is not set' };
  if (!to) return { sent: false, error: 'no recipient' };

  const payload = { from, to: [to], subject, text, html };
  if (process.env.MAIL_REPLY_TO) payload.reply_to = process.env.MAIL_REPLY_TO;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { sent: false, error: 'Resend ' + res.status + ': ' + (body.message || body.name || 'unknown error') };
    }
    return { sent: true, id: body.id || null };
  } catch (err) {
    return { sent: false, error: 'network: ' + (err && err.message ? err.message : String(err)) };
  }
}

export async function sendApprovalEmail(record) {
  if (!record.email) return { sent: false, error: 'submission has no email' };
  return sendMail(Object.assign({ to: record.email }, approvalEmail(record)));
}
