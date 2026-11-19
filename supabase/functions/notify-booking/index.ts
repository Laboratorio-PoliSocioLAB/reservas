// Supabase Edge Function: notify-booking
// Envía correos automáticos de aprobación, rechazo o cancelación desde la cuenta genérica de PoliSocioLAB
// Soporta Brevo (recomendado, 300/día gratis con cualquier remitente verificado) o Resend.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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
  const desc = [
    `Reserva aprobada en PoliSocioLAB (${booking.resource_label}).`,
    booking.purpose ? `Actividad: ${booking.purpose}` : '',
    `Referencia: ${booking.id}`,
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
    `UID:${booking.id}@polisociolab.ugr.es`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=Europe/Madrid:${ymd}T${startHm}`,
    `DTEND;TZID=Europe/Madrid:${ymd}T${endHm}`,
    `SUMMARY:PoliSocioLAB · ${booking.resource_label}`,
    `LOCATION:Facultad de Ciencias Políticas y Sociología, Universidad de Granada`,
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

  const metaByStatus: Record<string, { subject: string; heading: string; lead: string; badgeBg: string; badgeColor: string }> = {
    APROBADA: {
      subject: `Reserva aprobada · ${booking.resource_label} (${dateEs} ${start}–${end})`,
      heading: 'Tu reserva ha sido aprobada',
      lead: 'La Facultad ha confirmado tu solicitud de uso del laboratorio. Adjuntamos un archivo de calendario (.ics) para que puedas guardarla.',
      badgeBg: '#e4f3ea',
      badgeColor: '#1b5e36',
    },
    RECHAZADA: {
      subject: `Solicitud rechazada · ${booking.resource_label} (${dateEs} ${start}–${end})`,
      heading: 'Tu solicitud no ha podido ser aprobada',
      lead: 'La Facultad ha rechazado tu solicitud para esta franja. Puedes consultar otros horarios libres en el calendario de PoliSocioLAB.',
      badgeBg: '#fcebe8',
      badgeColor: '#8c281f',
    },
    CANCELADA: {
      subject: `Reserva cancelada · ${booking.resource_label} (${dateEs} ${start}–${end})`,
      heading: 'Tu reserva ha sido cancelada',
      lead: 'La reserva previamente aprobada ha sido cancelada por el personal de la Facultad.',
      badgeBg: '#f4ece7',
      badgeColor: '#5f4b43',
    },
  };

  const meta = metaByStatus[booking.status] ?? metaByStatus.RECHAZADA;
  const noteBlock = booking.review_note
    ? `<p style="margin:16px 0;padding:12px 14px;background:#fff8f2;border-left:4px solid #f37020;border-radius:4px"><strong>Nota de la Facultad:</strong> ${escapeHtml(booking.review_note)}</p>`
    : '';

  const html = `<!doctype html>
<html lang="es">
<body style="margin:0;padding:24px;background:#f9f4ef;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#2b221f">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5d9d0;border-radius:10px;overflow:hidden">
    <div style="background:#34231d;color:#ffffff;padding:20px 24px;border-bottom:4px solid #f37020">
      <div style="font-size:20px;font-weight:700;letter-spacing:-0.02em">PoliSocioLAB</div>
      <div style="font-size:13px;color:#ffe0cc;margin-top:2px">Facultad de Ciencias Políticas y Sociología · Universidad de Granada</div>
    </div>
    <div style="padding:24px">
      <span style="display:inline-block;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;background:${meta.badgeBg};color:${meta.badgeColor}">${escapeHtml(booking.status)}</span>
      <h1 style="font-size:20px;margin:12px 0 8px">${escapeHtml(meta.heading)}</h1>
      <p style="margin:0 0 16px;line-height:1.5">Hola, ${escapeHtml(booking.requester_name)}:</p>
      <p style="margin:0 0 16px;line-height:1.5">${escapeHtml(meta.lead)}</p>
      <table style="width:100%;border-collapse:collapse;background:#faf7f4;border:1px solid #e5d9d0;border-radius:6px">
        <tr><td style="padding:8px 12px;color:#64524a;width:120px">Espacio</td><td style="padding:8px 12px;font-weight:600">${escapeHtml(booking.resource_label)}</td></tr>
        <tr><td style="padding:8px 12px;color:#64524a;border-top:1px solid #eee5de">Fecha</td><td style="padding:8px 12px;font-weight:600;border-top:1px solid #eee5de">${escapeHtml(dateEs)}</td></tr>
        <tr><td style="padding:8px 12px;color:#64524a;border-top:1px solid #eee5de">Horario</td><td style="padding:8px 12px;font-weight:600;border-top:1px solid #eee5de">${escapeHtml(start)} – ${escapeHtml(end)} (hora de Granada)</td></tr>
        ${booking.purpose ? `<tr><td style="padding:8px 12px;color:#64524a;border-top:1px solid #eee5de">Actividad</td><td style="padding:8px 12px;border-top:1px solid #eee5de">${escapeHtml(booking.purpose)}</td></tr>` : ''}
        <tr><td style="padding:8px 12px;color:#64524a;border-top:1px solid #eee5de">Referencia</td><td style="padding:8px 12px;font-family:monospace;font-size:12px;border-top:1px solid #eee5de">${escapeHtml(booking.id)}</td></tr>
      </table>
      ${noteBlock}
      <p style="margin:20px 0 0;font-size:12px;color:#64524a">Este es un mensaje automático del sistema de reservas de PoliSocioLAB. Si necesitas responder, puedes contestar directamente a este correo.</p>
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
    `Horario: ${start}–${end} (hora de Granada)`,
    booking.purpose ? `Actividad: ${booking.purpose}` : '',
    booking.review_note ? `Nota de la Facultad: ${booking.review_note}` : '',
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
    throw new Error(`Mail relay HTTP ${res.status}: respuesta no JSON (${raw.slice(0, 200)})`);
  }
  if (!res.ok || !parsed?.ok) {
    throw new Error(`Mail relay error: ${parsed?.error || `HTTP ${res.status}`}`);
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
    throw new Error(`Brevo HTTP ${res.status}: ${errBody.slice(0, 300)}`);
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
    throw new Error(`Resend HTTP ${res.status}: ${errBody.slice(0, 300)}`);
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

    // 1. Verificar JWT del usuario autenticado
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user?.email) {
      return new Response(JSON.stringify({ error: 'Sesión de personal no válida.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // 2. Comprobar que el correo está autorizado en staff_users
    const { data: staffRow } = await adminClient
      .from('staff_users')
      .select('email')
      .eq('email', userData.user.email.toLowerCase())
      .maybeSingle();

    if (!staffRow) {
      return new Response(JSON.stringify({ error: 'Acceso reservado al personal autorizado.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { bookingId } = await req.json();
    if (!bookingId) {
      return new Response(JSON.stringify({ error: 'Falta bookingId.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Obtener datos de la reserva y su recurso
    const { data: booking, error: fetchErr } = await adminClient
      .from('bookings')
      .select('id, requester_name, requester_email, purpose, resource_id, booking_date, start_time, end_time, status, review_note, resources(label)')
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
      const msg = 'Falta configurar MAIL_RELAY_URL + MAIL_RELAY_SECRET (o proveedor SMTP/API) en Supabase Secrets.';
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
      const errMsg = sendErr instanceof Error ? sendErr.message : String(sendErr);
      await adminClient
        .from('bookings')
        .update({ mail_status: 'ERROR', mail_error: errMsg.slice(0, 500) })
        .eq('id', booking.id);
      return new Response(JSON.stringify({ ok: false, error: errMsg }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
