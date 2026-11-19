// Puente privado de correo para PoliSocioLAB (alojado en vcalero@go.ugr.es)
// Solo acepta peticiones POST firmadas desde la Edge Function notify-booking de Supabase
// y solo permite enviar correos a direcciones institucionales terminadas en ugr.es.

function getRelaySecret_() {
  return PropertiesService.getScriptProperties().getProperty('MAIL_RELAY_SECRET') || '';
}

function isValidUgrEmail_(value) {
  return /^[a-z0-9][a-z0-9._+-]{0,63}@([a-z0-9-]+\.)*ugr\.es$/i.test(String(value || '').trim());
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, service: 'PoliSocioLAB Mail Relay' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const expected = getRelaySecret_();
    if (!expected || typeof body.secret !== 'string' || body.secret !== expected) {
      return jsonOut_({ ok: false, error: 'No autorizado.' });
    }

    const to = String(body.to || '').trim().toLowerCase();
    if (!isValidUgrEmail_(to)) {
      return jsonOut_({ ok: false, error: 'Destinatario fuera del dominio ugr.es.' });
    }

    const subject = String(body.subject || '').trim();
    const text = String(body.text || '').trim();
    const html = String(body.html || '').trim();
    const senderName = String(body.name || 'PoliSocioLAB · Facultad de Ciencias Políticas y Sociología').trim();
    const replyTo = String(body.replyTo || '').trim();
    if (!subject || !text) {
      return jsonOut_({ ok: false, error: 'Faltan asunto o cuerpo del correo.' });
    }

    if (MailApp.getRemainingDailyQuota() < 1) {
      return jsonOut_({ ok: false, error: 'Cuota diaria de MailApp agotada.' });
    }

    const options = {
      to,
      subject,
      body: text,
      name: senderName,
    };
    if (html) options.htmlBody = html;
    if (replyTo && isValidUgrEmail_(replyTo)) options.replyTo = replyTo;
    if (typeof body.ics === 'string' && body.ics.trim()) {
      options.attachments = [
        Utilities.newBlob(body.ics, 'text/calendar; charset=utf-8; method=PUBLISH', 'reserva-polisociolab.ics'),
      ];
    }

    MailApp.sendEmail(options);
    return jsonOut_({ ok: true, remainingQuota: MailApp.getRemainingDailyQuota() });
  } catch (err) {
    return jsonOut_({ ok: false, error: err && err.message ? err.message : String(err) });
  }
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function limpiarTriggersAntiguos() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
}
