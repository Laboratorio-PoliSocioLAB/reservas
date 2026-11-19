// Supabase Edge Function: notify-new-request
// Envía un aviso por correo al personal (STAFF_NOTIFY_EMAIL)
// cada vez que entra una nueva solicitud de reserva PENDIENTE de un usuario autenticado con Google (@go.ugr.es).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.119.2';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GO_UGR_EMAIL_REGEX = /^[a-z0-9][a-z0-9._+-]{0,63}@go\.ugr\.es$/i;
const DEFAULT_ALLOWED_ORIGINS = ['https://laboratorio-polisociolab.github.io'];

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

function buildStaffAlertEmail(
  booking: {
    id: string;
    requester_name: string;
    requester_email: string;
    booking_date: string;
    start_time: string;
    end_time: string;
    purpose: string;
    resource_label: string;
  },
  adminUrl: string
) {
  const dateEs = formatDateEs(booking.booking_date);
  const start = formatTimeShort(booking.start_time);
  const end = formatTimeShort(booking.end_time);
  const cleanLabel = stripHeaderControls(booking.resource_label);

  const subject = `Nueva solicitud de reserva · ${cleanLabel} (${dateEs} ${start}–${end})`;

  const html = `<!doctype html>
<html lang="es">
<body style="margin:0;padding:24px;background:#f8fafc;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-top:5px solid #f37020;border-radius:10px;overflow:hidden">
    <div style="background:#ffffff;color:#0f172a;padding:20px 24px;border-bottom:1px solid #e2e8f0">
      <div style="font-size:21px;font-weight:700;letter-spacing:-0.02em;color:#d95708">PoliSocioLAB</div>
      <div style="font-size:13px;color:#475569;margin-top:2px">Facultad de Ciencias Políticas y Sociología · Universidad de Granada</div>
    </div>
    <div style="padding:24px">
      <span style="display:inline-block;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;background:#ffedd5;color:#9a3412">PENDIENTE DE REVISIÓN</span>
      <h1 style="font-size:20px;margin:12px 0 8px;color:#0f172a">Nueva solicitud de reserva</h1>
      <p style="margin:0 0 16px;line-height:1.5">Se ha registrado una nueva petición de uso de laboratorio pendiente de aprobación.</p>
      <table style="width:100%;border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
        <tr><td style="padding:8px 12px;color:#475569;width:120px">Solicitante</td><td style="padding:8px 12px;font-weight:600">${escapeHtml(booking.requester_name)}</td></tr>
        <tr><td style="padding:8px 12px;color:#475569;border-top:1px solid #e2e8f0">Correo</td><td style="padding:8px 12px;border-top:1px solid #e2e8f0"><a href="mailto:${escapeHtml(booking.requester_email)}" style="color:#c84f08">${escapeHtml(booking.requester_email)}</a></td></tr>
        <tr><td style="padding:8px 12px;color:#475569;border-top:1px solid #e2e8f0">Espacio</td><td style="padding:8px 12px;font-weight:600;border-top:1px solid #e2e8f0">${escapeHtml(booking.resource_label)}</td></tr>
        <tr><td style="padding:8px 12px;color:#475569;border-top:1px solid #e2e8f0">Fecha</td><td style="padding:8px 12px;font-weight:600;border-top:1px solid #e2e8f0">${escapeHtml(dateEs)}</td></tr>
        <tr><td style="padding:8px 12px;color:#475569;border-top:1px solid #e2e8f0">Horario</td><td style="padding:8px 12px;font-weight:600;border-top:1px solid #e2e8f0">${escapeHtml(start)} – ${escapeHtml(end)}</td></tr>
        ${booking.purpose ? `<tr><td style="padding:8px 12px;color:#475569;border-top:1px solid #e2e8f0">Actividad</td><td style="padding:8px 12px;border-top:1px solid #e2e8f0">${escapeHtml(booking.purpose)}</td></tr>` : ''}
        <tr><td style="padding:8px 12px;color:#475569;border-top:1px solid #e2e8f0">Referencia</td><td style="padding:8px 12px;font-family:monospace;font-size:12px;border-top:1px solid #e2e8f0">${escapeHtml(booking.id)}</td></tr>
      </table>
      <p style="margin:20px 0 0">
        <a href="${escapeHtml(adminUrl)}" style="display:inline-block;padding:11px 18px;background:#c84f08;color:#ffffff;text-decoration:none;font-weight:700;border-radius:6px">Revisar en el panel de gestión</a>
      </p>
      <p style="margin:18px 0 0;font-size:12px;color:#475569">Si necesitas contactar con quien solicita la reserva antes de resolverla, puedes responder directamente a este correo.</p>
    </div>
  </div>
</body>
</html>`;

  const text = [
    'Nueva solicitud de reserva pendiente de revisión',
    '',
    `Solicitante: ${booking.requester_name}`,
    `Correo: ${booking.requester_email}`,
    `Espacio: ${booking.resource_label}`,
    `Fecha: ${dateEs}`,
    `Horario: ${start}–${end}`,
    booking.purpose ? `Actividad: ${booking.purpose}` : '',
    `Referencia: ${booking.id}`,
    '',
    `Panel de gestión: ${adminUrl}`,
    '',
    'PoliSocioLAB · Facultad de Ciencias Políticas y Sociología · UGR',
  ]
    .filter(Boolean)
    .join('\n');

  return { subject, html, text };
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

Deno.serve(async (req) => {
  const { headers: corsHeaders, originAllowed } = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    if (!originAllowed) {
      return new Response('Forbidden', { status: 403, headers: corsHeaders });
    }
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Método no permitido.' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!originAllowed) {
    return new Response(JSON.stringify({ ok: false, error: 'Origen no autorizado.' }), {
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
      return new Response(
        JSON.stringify({ ok: false, error: 'Se requiere sesión verificada @go.ugr.es.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Verificar JWT de usuario autenticado con Google (@go.ugr.es) y correo confirmado
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    const user = userData?.user;
    const userEmail = (user?.email || '').trim().toLowerCase();

    if (userErr || !user || !user.email_confirmed_at || !GO_UGR_EMAIL_REGEX.test(userEmail) || !hasOAuthAmr(jwt)) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Se requiere sesión verificada @go.ugr.es.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: isVerified, error: verifyErr } = await userClient.rpc('is_verified_go_ugr_user');
    if (verifyErr || isVerified !== true) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Se requiere sesión verificada @go.ugr.es.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const bookingId = typeof body?.bookingId === 'string' ? body.bookingId.trim() : '';

    if (!UUID_REGEX.test(bookingId)) {
      return new Response(JSON.stringify({ ok: false, error: 'bookingId no válido.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const relayUrl = Deno.env.get('MAIL_RELAY_URL') || '';
    const relaySecret = Deno.env.get('MAIL_RELAY_SECRET') || '';
    const fromName = Deno.env.get('MAIL_FROM_NAME') || 'PoliSocioLAB · Facultad de Ciencias Políticas y Sociología';
    const staffNotifyEmail = (Deno.env.get('STAFF_NOTIFY_EMAIL') || 'vcalero@ugr.es').trim().toLowerCase();
    const adminUrl =
      Deno.env.get('ADMIN_PANEL_URL') || 'https://laboratorio-polisociolab.github.io/reservas/admin.html';

    if (!relayUrl || !relaySecret) {
      console.error('Falta configurar MAIL_RELAY_URL y MAIL_RELAY_SECRET en Supabase Secrets.');
      return new Response(
        JSON.stringify({ ok: false, error: 'Servicio de avisos no disponible.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // 2. Reclamo atómico: solo notifica una vez, solo para la solicitud PENDIENTE del propio usuario creada hace <10 min
    const claimStamp = new Date().toISOString();
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: booking, error: claimErr } = await adminClient
      .from('bookings')
      .update({ staff_notified_at: claimStamp })
      .eq('id', bookingId)
      .eq('requester_email', userEmail)
      .eq('status', 'PENDIENTE')
      .is('staff_notified_at', null)
      .gte('created_at', tenMinutesAgo)
      .select('id, requester_name, requester_email, purpose, resource_id, booking_date, start_time, end_time, resources(label)')
      .maybeSingle();

    if (claimErr) {
      console.error('Error reclamando reserva en notify-new-request:', claimErr.message);
      throw new Error('No se pudo preparar el aviso.');
    }

    if (!booking) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resourceRel = booking.resources as { label?: string } | { label?: string }[] | null;
    const resourceLabel = Array.isArray(resourceRel)
      ? resourceRel[0]?.label || booking.resource_id
      : resourceRel?.label || booking.resource_id;

    const { subject, html, text } = buildStaffAlertEmail(
      { ...booking, resource_label: resourceLabel },
      adminUrl
    );

    try {
      await sendViaMailRelay({
        relayUrl,
        relaySecret,
        fromName,
        replyTo: booking.requester_email,
        toEmail: staffNotifyEmail,
        subject,
        html,
        text,
      });
    } catch (relayErr) {
      // Revertir reclamo si falló el envío para no perder el aviso ante un error transitorio
      await adminClient
        .from('bookings')
        .update({ staff_notified_at: null })
        .eq('id', booking.id)
        .eq('staff_notified_at', claimStamp);
      throw relayErr;
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error en notify-new-request:', err);
    return new Response(JSON.stringify({ ok: false, error: 'No se pudo enviar el aviso al personal.' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
