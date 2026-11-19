// Supabase Edge Function: notify-booking
// Envía correos automáticos de aprobación, rechazo o cancelación desde la cuenta institucional de PoliSocioLAB
// Soporta puente Mail Relay (Apps Script), Brevo o Resend.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.119.2';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_ALLOWED_ORIGINS = ['https://laboratorio-polisociolab.github.io'];
const RESEND_COOLDOWN_MS = 30_000;

function getAllowedOrigins(): string[] {
  const configured = Deno.env.get('ALLOWED_ORIGINS') || '';
  const list = configured
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return list.length ? list : DEFAULT_ALLOWED_ORIGINS;
}

function getCorsHeaders(req: Request): { headers: Record<string, string>; originAllowed: boolean } {
  const origin = req.headers.get('Origin') || '';
  const allowed = getAllowedOrigins();
  const originAllowed = !origin || allowed.includes(origin);
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  if (origin && allowed.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return { headers, originAllowed };
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replaceAll('-', '+').replaceAll('_', '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const json = new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function hasOAuthAmr(token: string): boolean {
  const payload = decodeJwtPayload(token);
  const amr = payload?.amr;
  if (!Array.isArray(amr)) return false;
  return amr.some((entry) => typeof entry === 'object' && entry !== null && (entry as { method?: unknown }).method === 'oauth');
}

function escapeHtml(text: string): string {
  return String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// Escape RFC 5545 (§3.3.11) para valores TEXT en archivos .ics (evita inyección CRLF/propiedades)
function escapeIcsText(text: string): string {
  return String(text || '')
    .replace(/\r\n|\r/g, '\n')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replaceAll('\n', '\\n');
}

function stripHeaderControls(text: string): string {
  return String(text || '').replace(/[\r\n\x00-\x1F\x7F]+/g, ' ').trim();
}

function formatDateEs(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

function formatTimeShort(t: string): string {
  return String(t || '').slice(0, 5);
}

function buildIcs(booking: {
  id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  resource_label: string;
  purpose: string;
}): string {
  const ymd = booking.booking_date.replaceAll('-', '');
  const startHm = formatTimeShort(booking.start_time).replace(':', '') + '00';
  const endHm = formatTimeShort(booking.end_time).replace(':', '') + '00';
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const safeId = escapeIcsText(booking.id);
  const safeLabel = escapeIcsText(booking.resource_label);
  const safePurpose = booking.purpose ? escapeIcsText(booking.purpose) : '';

  const desc = [
    `Reserva aprobada en PoliSocioLAB (${safeLabel}).`,
    safePurpose ? `Actividad: ${safePurpose}` : '',
    `Referencia: ${safeId}`,
  ]
    .filter(Boolean)
    .join('\\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PoliSocioLAB UGR//Reservas//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${safeId}@polisociolab.ugr.es`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=Europe/Madrid:${ymd}T${startHm}`,
    `DTEND;TZID=Europe/Madrid:${ymd}T${endHm}`,
    `SUMMARY:PoliSocioLAB · ${safeLabel}`,
    'LOCATION:Facultad de Ciencias Políticas y Sociología\\, Universidad de Granada',
    `DESCRIPTION:${desc}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function buildEmailContent(booking: {
  id: string;
  requester_name: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: string;
  review_note: string;
  purpose: string;
  resource_label: string;
}) {
  const dateEs = formatDateEs(booking.booking_date);
  const start = formatTimeShort(booking.start_time);
  const end = formatTimeShort(booking.end_time);
  const cleanLabel = stripHeaderControls(booking.resource_label);

  const metaByStatus: Record<string, { subject: string; heading: string; lead: string; badgeBg: string; badgeColor: string }> = {
    APROBADA: {
      subject: `Reserva aprobada · ${cleanLabel} (${dateEs} ${start}–${end})`,
      heading: 'Tu reserva ha sido aprobada',
      lead: '',
      badgeBg: '#e4f3ea',
      badgeColor: '#1b5e36',
    },
    RECHAZADA: {
      subject: `Solicitud rechazada · ${cleanLabel} (${dateEs} ${start}–${end})`,
      heading: 'Tu solicitud no ha podido ser aprobada',
      lead: 'Se ha rechazado la solicitud.',
      badgeBg: '#fcebe8',
      badgeColor: '#8c281f',
    },
    CANCELADA: {
      subject: `Reserva cancelada · ${cleanLabel} (${dateEs} ${start}–${end})`,
      heading: 'Tu reserva ha sido cancelada',
      lead: 'La reserva previamente aprobada ha sido cancelada por el personal de la Facultad.',
      badgeBg: '#f4ece7',
      badgeColor: '#5f4b43',
    },
  };

  const meta = metaByStatus[booking.status] ?? metaByStatus.RECHAZADA;
  const noteBlock = booking.review_note
    ? `<p style="margin:16px 0;padding:12px 14px;background:#fff7f2;border-left:4px solid #f37020;border-radius:4px"><strong>Comentario:</strong> ${escapeHtml(booking.review_note)}</p>`
    : '';

  const html = `<!doctype html>
<html lang="es">
<body style="margin:0;padding:24px;background:#f8fafc;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-top:5px solid #f37020;border-radius:10px;overflow:hidden">
    <div style="background:#ffffff;color:#0f172a;padding:20px 24px;border-bottom:1px solid #e2e8f0">
      <div style="font-size:21px;font-weight:700;letter-spacing:-0.02em;color:#d95708">PoliSocioLAB</div>
      <div style="font-size:13px;color:#475569;margin-top:2px">Facultad de Ciencias Políticas y Sociología · Universidad de Granada</div>
    </div>
    <div style="padding:24px">
      <span style="display:inline-block;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;background:${meta.badgeBg};color:${meta.badgeColor}">${escapeHtml(booking.status)}</span>
      <h1 style="font-size:20px;margin:12px 0 8px;color:#0f172a">${escapeHtml(meta.heading)}</h1>
      <p style="margin:0 0 16px;line-height:1.5">Hola, ${escapeHtml(booking.requester_name)}:</p>
      ${meta.lead ? `<p style="margin:0 0 16px;line-height:1.5">${escapeHtml(meta.lead)}</p>` : ''}
      <table style="width:100%;border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
        <tr><td style="padding:8px 12px;color:#475569;width:120px">Espacio</td><td style="padding:8px 12px;font-weight:600">${escapeHtml(booking.resource_label)}</td></tr>
        <tr><td style="padding:8px 12px;color:#475569;border-top:1px solid #e2e8f0">Fecha</td><td style="padding:8px 12px;font-weight:600;border-top:1px solid #e2e8f0">${escapeHtml(dateEs)}</td></tr>
        <tr><td style="padding:8px 12px;color:#475569;border-top:1px solid #e2e8f0">Horario</td><td style="padding:8px 12px;font-weight:600;border-top:1px solid #e2e8f0">${escapeHtml(start)} – ${escapeHtml(end)}</td></tr>
        ${booking.purpose ? `<tr><td style="padding:8px 12px;color:#475569;border-top:1px solid #e2e8f0">Actividad</td><td style="padding:8px 12px;border-top:1px solid #e2e8f0">${escapeHtml(booking.purpose)}</td></tr>` : ''}
        <tr><td style="padding:8px 12px;color:#475569;border-top:1px solid #e2e8f0">Referencia</td><td style="padding:8px 12px;font-family:monospace;font-size:12px;border-top:1px solid #e2e8f0">${escapeHtml(booking.id)}</td></tr>
      </table>
      ${noteBlock}
    </div>
  </div>
</body>
</html>`;

  const text = [
    meta.heading,
    '',
    `Hola, ${booking.requester_name}:`,
    meta.lead,
    '',
    `Espacio: ${booking.resource_label}`,
    `Fecha: ${dateEs}`,
    `Horario: ${start}–${end}`,
    booking.purpose ? `Actividad: ${booking.purpose}` : '',
    booking.review_note ? `Comentario: ${booking.review_note}` : '',
    `Referencia: ${booking.id}`,
    '',
    'PoliSocioLAB · Facultad de Ciencias Políticas y Sociología · UGR',
  ]
    .filter(Boolean)
    .join('\n');

  return { subject: meta.subject, html, text };
}

async function sendViaMailRelay(params: {
  relayUrl: string;
  relaySecret: string;
  fromName: string;
  replyTo?: string;
  toEmail: string;
  subject: string;
  html: string;
  text: string;
  icsContent?: string;
}) {
  const res = await fetch(params.relayUrl, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      secret: params.relaySecret,
      to: params.toEmail,
      subject: params.subject,
      text: params.text,
      html: params.html,
      name: params.fromName,
      replyTo: params.replyTo || '',
      ics: params.icsContent || '',
    }),
  });

  const raw = await res.text();
  let parsed: { ok?: boolean; error?: string } | null = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error('Mail relay respuesta no JSON:', res.status, raw.slice(0, 300));
    throw new Error(`Error del servicio de correo (HTTP ${res.status}).`);
  }
  if (!res.ok || !parsed?.ok) {
    console.error('Mail relay devolvió error:', res.status, parsed?.error || 'sin detalle');
    throw new Error(`El servicio de correo rechazó el envío (HTTP ${res.status}).`);
  }
}

async function sendViaBrevo(params: {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
  toEmail: string;
  toName: string;
  subject: string;
  html: string;
  text: string;
  icsContent?: string;
}) {
  const payload: Record<string, unknown> = {
    sender: { name: params.fromName, email: params.fromEmail },
    to: [{ email: params.toEmail, name: params.toName }],
    subject: params.subject,
    htmlContent: params.html,
    textContent: params.text,
  };
  if (params.replyTo) {
    payload.replyTo = { email: params.replyTo, name: params.fromName };
  }
  if (params.icsContent) {
    payload.attachment = [
      {
        name: 'reserva-polisociolab.ics',
        content: toBase64(params.icsContent),
      },
    ];
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': params.apiKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error('Brevo error:', res.status, errBody.slice(0, 300));
    throw new Error(`Error en el proveedor de correo Brevo (HTTP ${res.status}).`);
  }
}

async function sendViaResend(params: {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
  toEmail: string;
  subject: string;
  html: string;
  text: string;
  icsContent?: string;
}) {
  const payload: Record<string, unknown> = {
    from: `${params.fromName} <${params.fromEmail}>`,
    to: [params.toEmail],
    subject: params.subject,
    html: params.html,
    text: params.text,
  };
  if (params.replyTo) {
    payload.reply_to = params.replyTo;
  }
  if (params.icsContent) {
    payload.attachments = [
      {
        filename: 'reserva-polisociolab.ics',
        content: toBase64(params.icsContent),
      },
    ];
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error('Resend error:', res.status, errBody.slice(0, 300));
    throw new Error(`Error en el proveedor de correo Resend (HTTP ${res.status}).`);
  }
}

Deno.serve(async (req) => {
  const { headers: corsHeaders, originAllowed } = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    if (!originAllowed) {
      return new Response('Forbidden', { status: 403, headers: corsHeaders });
    }
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido.' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!originAllowed) {
    return new Response(JSON.stringify({ error: 'Origen no autorizado.' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization') ?? '';
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const jwt = bearerMatch?.[1]?.trim() || '';

    if (!jwt) {
      return new Response(JSON.stringify({ error: 'Sesión de personal no válida.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Verificar JWT de usuario activo, correo confirmado y sesión OAuth (Google)
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    const user = userData?.user;

    if (userErr || !user?.email || !user.email_confirmed_at || !hasOAuthAmr(jwt)) {
      return new Response(JSON.stringify({ error: 'Sesión de personal no válida.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: isStaffRpc, error: staffRpcErr } = await userClient.rpc('is_staff');
    if (staffRpcErr || isStaffRpc !== true) {
      return new Response(JSON.stringify({ error: 'Acceso reservado al personal autorizado.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // 2. Doble comprobación en staff_users
    const { data: staffRow } = await adminClient
      .from('staff_users')
      .select('email')
      .eq('email', user.email.toLowerCase())
      .maybeSingle();

    if (!staffRow) {
      return new Response(JSON.stringify({ error: 'Acceso reservado al personal autorizado.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const bookingId = typeof body?.bookingId === 'string' ? body.bookingId.trim() : '';
    if (!UUID_REGEX.test(bookingId)) {
      return new Response(JSON.stringify({ error: 'bookingId no válido.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Obtener datos de la reserva y su recurso
    const { data: booking, error: fetchErr } = await adminClient
      .from('bookings')
      .select('id, requester_name, requester_email, purpose, resource_id, booking_date, start_time, end_time, status, review_note, mail_status, mail_sent_at, resources(label)')
      .eq('id', bookingId)
      .single();

    if (fetchErr || !booking) {
      return new Response(JSON.stringify({ error: 'Reserva no encontrada.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!['APROBADA', 'RECHAZADA', 'CANCELADA'].includes(booking.status)) {
      return new Response(JSON.stringify({ error: 'La reserva todavía está pendiente.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Evitar envíos duplicados accidentales por doble clic (30 s de margen si ya figura como ENVIADO)
    if (
      booking.mail_status === 'ENVIADO' &&
      booking.mail_sent_at &&
      Date.now() - Date.parse(booking.mail_sent_at) < RESEND_COOLDOWN_MS
    ) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resourceRel = booking.resources as { label?: string } | { label?: string }[] | null;
    const resourceLabel = Array.isArray(resourceRel)
      ? resourceRel[0]?.label || booking.resource_id
      : resourceRel?.label || booking.resource_id;

    const fullBooking = {
      ...booking,
      resource_label: resourceLabel,
    };

    const { subject, html, text } = buildEmailContent(fullBooking);
    const icsContent = booking.status === 'APROBADA' ? buildIcs(fullBooking) : undefined;

    const relayUrl = Deno.env.get('MAIL_RELAY_URL') || '';
    const relaySecret = Deno.env.get('MAIL_RELAY_SECRET') || '';
    const fromEmail = Deno.env.get('MAIL_FROM_EMAIL') || '';
    const fromName = Deno.env.get('MAIL_FROM_NAME') || 'PoliSocioLAB · Facultad de Ciencias Políticas y Sociología';
    const replyTo = Deno.env.get('MAIL_REPLY_TO') || 'vcalero@go.ugr.es';
    const brevoKey = Deno.env.get('BREVO_API_KEY') || '';
    const resendKey = Deno.env.get('RESEND_API_KEY') || '';

    const hasRelay = Boolean(relayUrl && relaySecret);
    const hasThirdParty = Boolean(fromEmail && (brevoKey || resendKey));

    if (!hasRelay && !hasThirdParty) {
      console.error('Faltan credenciales de envío de correo en Supabase Secrets.');
      const msg = 'Servicio de correo no configurado.';
      await adminClient
        .from('bookings')
        .update({ mail_status: 'ERROR', mail_error: msg })
        .eq('id', booking.id);
      return new Response(JSON.stringify({ ok: false, error: msg }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    try {
      if (hasRelay) {
        await sendViaMailRelay({
          relayUrl,
          relaySecret,
          fromName,
          replyTo,
          toEmail: booking.requester_email,
          subject,
          html,
          text,
          icsContent,
        });
      } else if (brevoKey) {
        await sendViaBrevo({
          apiKey: brevoKey,
          fromEmail,
          fromName,
          replyTo,
          toEmail: booking.requester_email,
          toName: booking.requester_name,
          subject,
          html,
          text,
          icsContent,
        });
      } else {
        await sendViaResend({
          apiKey: resendKey,
          fromEmail,
          fromName,
          replyTo,
          toEmail: booking.requester_email,
          subject,
          html,
          text,
          icsContent,
        });
      }

      await adminClient
        .from('bookings')
        .update({
          mail_status: 'ENVIADO',
          mail_error: '',
          mail_sent_at: new Date().toISOString(),
        })
        .eq('id', booking.id);

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (sendErr) {
      const errMsg = sendErr instanceof Error ? sendErr.message : 'Error al enviar el correo.';
      await adminClient
        .from('bookings')
        .update({ mail_status: 'ERROR', mail_error: errMsg.slice(0, 200) })
        .eq('id', booking.id);
      return new Response(JSON.stringify({ ok: false, error: errMsg }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (err) {
    console.error('Error inesperado en notify-booking:', err);
    return new Response(JSON.stringify({ error: 'Error interno al procesar la notificación.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
