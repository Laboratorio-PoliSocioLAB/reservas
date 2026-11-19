// Supabase Edge Function: notify-new-request
// Envía un aviso por correo al personal (STAFF_NOTIFY_EMAIL, p. ej. vcalero@ugr.es)
// cada vez que entra una nueva solicitud de reserva PENDIENTE de un usuario autenticado @go.ugr.es.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GO_UGR_EMAIL_REGEX = /^[a-z0-9][a-z0-9._+-]{0,63}@go\.ugr\.es$/i;

function escapeHtml(text: string): string {
  return String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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

  const subject = `Nueva solicitud de reserva · ${booking.resource_label} (${dateEs} ${start}–${end})`;

  const html = `<!doctype html>
<html lang="es">
<body style="margin:0;padding:24px;background:#f9f4ef;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#2b221f">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5d9d0;border-radius:10px;overflow:hidden">
    <div style="background:#34231d;color:#ffffff;padding:20px 24px;border-bottom:4px solid #f37020">
      <div style="font-size:20px;font-weight:700;letter-spacing:-0.02em">PoliSocioLAB</div>
      <div style="font-size:13px;color:#ffe0cc;margin-top:2px">Facultad de Ciencias Políticas y Sociología · Universidad de Granada</div>
    </div>
    <div style="padding:24px">
      <span style="display:inline-block;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;background:#fff0e3;color:#a84308">PENDIENTE DE REVISIÓN</span>
      <h1 style="font-size:20px;margin:12px 0 8px">Nueva solicitud de reserva</h1>
      <p style="margin:0 0 16px;line-height:1.5">Se ha registrado una nueva petición de uso de laboratorio pendiente de aprobación.</p>
      <table style="width:100%;border-collapse:collapse;background:#faf7f4;border:1px solid #e5d9d0;border-radius:6px">
        <tr><td style="padding:8px 12px;color:#64524a;width:120px">Solicitante</td><td style="padding:8px 12px;font-weight:600">${escapeHtml(booking.requester_name)}</td></tr>
        <tr><td style="padding:8px 12px;color:#64524a;border-top:1px solid #eee5de">Correo</td><td style="padding:8px 12px;border-top:1px solid #eee5de"><a href="mailto:${escapeHtml(booking.requester_email)}" style="color:#c4510e">${escapeHtml(booking.requester_email)}</a></td></tr>
        <tr><td style="padding:8px 12px;color:#64524a;border-top:1px solid #eee5de">Espacio</td><td style="padding:8px 12px;font-weight:600;border-top:1px solid #eee5de">${escapeHtml(booking.resource_label)}</td></tr>
        <tr><td style="padding:8px 12px;color:#64524a;border-top:1px solid #eee5de">Fecha</td><td style="padding:8px 12px;font-weight:600;border-top:1px solid #eee5de">${escapeHtml(dateEs)}</td></tr>
        <tr><td style="padding:8px 12px;color:#64524a;border-top:1px solid #eee5de">Horario</td><td style="padding:8px 12px;font-weight:600;border-top:1px solid #eee5de">${escapeHtml(start)} – ${escapeHtml(end)}</td></tr>
        ${booking.purpose ? `<tr><td style="padding:8px 12px;color:#64524a;border-top:1px solid #eee5de">Actividad</td><td style="padding:8px 12px;border-top:1px solid #eee5de">${escapeHtml(booking.purpose)}</td></tr>` : ''}
        <tr><td style="padding:8px 12px;color:#64524a;border-top:1px solid #eee5de">Referencia</td><td style="padding:8px 12px;font-family:monospace;font-size:12px;border-top:1px solid #eee5de">${escapeHtml(booking.id)}</td></tr>
      </table>
      <p style="margin:20px 0 0">
        <a href="${escapeHtml(adminUrl)}" style="display:inline-block;padding:11px 18px;background:#f37020;color:#ffffff;text-decoration:none;font-weight:700;border-radius:6px">Revisar en el panel de gestión</a>
      </p>
      <p style="margin:18px 0 0;font-size:12px;color:#64524a">Si necesitas contactar con quien solicita la reserva antes de resolverla, puedes responder directamente a este correo.</p>
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
    throw new Error(`Mail relay HTTP ${res.status}: respuesta no JSON (${raw.slice(0, 200)})`);
  }
  if (!res.ok || !parsed?.ok) {
    throw new Error(`Mail relay error: ${parsed?.error || `HTTP ${res.status}`}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization') ?? '';

    // 1. Verificar JWT de usuario autenticado @go.ugr.es
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    const userEmail = (userData?.user?.email || '').trim().toLowerCase();

    if (userErr || !userEmail || !GO_UGR_EMAIL_REGEX.test(userEmail)) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Se requiere sesión verificada @go.ugr.es.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
      return new Response(
        JSON.stringify({ ok: false, error: 'Falta configurar MAIL_RELAY_URL y MAIL_RELAY_SECRET.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // 2. Reclamo atómico: solo notifica una vez, solo para la solicitud PENDIENTE del propio usuario creada hace <10 min
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: booking, error: claimErr } = await adminClient
      .from('bookings')
      .update({ staff_notified_at: new Date().toISOString() })
      .eq('id', bookingId)
      .eq('requester_email', userEmail)
      .eq('status', 'PENDIENTE')
      .is('staff_notified_at', null)
      .gte('created_at', tenMinutesAgo)
      .select('id, requester_name, requester_email, purpose, resource_id, booking_date, start_time, end_time, resources(label)')
      .maybeSingle();

    if (claimErr) {
      throw new Error(claimErr.message);
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

    return new Response(JSON.stringify({ ok: true, notified: staffNotifyEmail }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
