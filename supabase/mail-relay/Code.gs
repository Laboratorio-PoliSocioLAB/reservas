// Puente privado de correo para PoliSocioLAB
// Solo acepta peticiones POST autenticadas desde las Edge Functions de Supabase
// y limita destinatarios (*ugr.es), prefijos de asunto institucionales y tasa por minuto.

const ALLOWED_SUBJECT_PREFIXES_ = [
  'Reserva aprobada · ',
  'Solicitud rechazada · ',
  'Reserva cancelada · ',
  'Nueva solicitud de reserva · ',
];

const FIXED_SENDER_NAME_ = 'PoliSocioLAB · Facultad de Ciencias Políticas y Sociología';
const MAX_EMAILS_PER_MINUTE_ = 20;

function getRelaySecret_() {
  return PropertiesService.getScriptProperties().getProperty('MAIL_RELAY_SECRET') || '';
}

function timingSafeEqual_(a, b) {
  const sa = String(a || '');
  const sb = String(b || '');
  const len = Math.max(sa.length, sb.length);
  let diff = sa.length ^ sb.length;
  for (let i = 0; i < len; i++) {
    const ca = i < sa.length ? sa.charCodeAt(i) : 0;
    const cb = i < sb.length ? sb.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

function isValidUgrEmail_(value) {
  return /^[a-z0-9][a-z0-9._+-]{0,63}@([a-z0-9-]+\.)*ugr\.es$/i.test(String(value || '').trim());
}

function isAllowedSubject_(subject) {
  return ALLOWED_SUBJECT_PREFIXES_.some((prefix) => subject.indexOf(prefix) === 0);
}

function checkRateLimit_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const cache = CacheService.getScriptCache();
    const minuteBucket = Math.floor(Date.now() / 60000);
    const key = 'relay_rl_' + minuteBucket;
    const count = Number(cache.get(key) || '0');
    if (count >= MAX_EMAILS_PER_MINUTE_) {
      return false;
    }
    cache.put(key, String(count + 1), 120);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return jsonOut_({ ok: false });
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const expected = getRelaySecret_();
    if (!expected || typeof body.secret !== 'string' || !timingSafeEqual_(body.secret, expected)) {
      return jsonOut_({ ok: false, error: 'No autorizado.' });
    }

    if (!checkRateLimit_()) {
      return jsonOut_({ ok: false, error: 'Límite temporal de envíos superado.' });
    }

    const to = String(body.to || '').trim().toLowerCase();
    if (!isValidUgrEmail_(to)) {
      return jsonOut_({ ok: false, error: 'Destinatario fuera del dominio ugr.es.' });
    }

    const subject = String(body.subject || '').replace(/[\r\n\x00-\x1F\x7F]+/g, ' ').trim();
    const text = String(body.text || '').trim();
    const html = String(body.html || '').trim();
    const replyTo = String(body.replyTo || '').trim().toLowerCase();

    if (!subject || subject.length > 200 || !isAllowedSubject_(subject)) {
      return jsonOut_({ ok: false, error: 'Asunto no permitido.' });
    }
    if (!text || text.length > 10000 || html.length > 30000) {
      return jsonOut_({ ok: false, error: 'Cuerpo del correo inválido o demasiado grande.' });
    }

    if (MailApp.getRemainingDailyQuota() < 1) {
      return jsonOut_({ ok: false, error: 'Cuota diaria agotada.' });
    }

    const options = {
      to,
      subject,
      body: text,
      name: FIXED_SENDER_NAME_,
    };
    if (html) options.htmlBody = html;
    if (replyTo && isValidUgrEmail_(replyTo)) options.replyTo = replyTo;

    if (typeof body.ics === 'string' && body.ics.trim()) {
      const ics = body.ics.trim();
      if (ics.length > 10000 || !ics.startsWith('BEGIN:VCALENDAR') || !ics.endsWith('END:VCALENDAR')) {
        return jsonOut_({ ok: false, error: 'Adjunto de calendario no válido.' });
      }
      options.attachments = [
        Utilities.newBlob(ics, 'text/calendar; charset=utf-8; method=PUBLISH', 'reserva-polisociolab.ics'),
      ];
    }

    MailApp.sendEmail(options);
    return jsonOut_({ ok: true });
  } catch (err) {
    console.error('Error en Mail Relay:', err && err.message ? err.message : String(err));
    return jsonOut_({ ok: false, error: 'Error al enviar el correo.' });
  }
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function limpiarTriggersAntiguos() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
}
