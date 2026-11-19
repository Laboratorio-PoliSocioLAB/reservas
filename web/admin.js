import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { CONFIG, isConfigured } from './config.js';
import { RESOURCE_LABELS, formatDateShortEs, formatMadridToday } from './shared.js';

const $ = (id) => document.getElementById(id);
const configured = isConfigured();
const supabase = configured ? createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY) : null;

const TARGET_LABELS = {
  ...RESOURCE_LABELS,
  CUALITATIVO2: 'Laboratorio cualitativo 2 (todos los puestos)',
};

let allBookings = [];
let currentUserEmail = '';

function setStatus(message, kind = 'info') {
  const el = $('status');
  if (!message) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.dataset.kind = kind;
  el.textContent = message;
}

function shortTime(t) {
  return String(t || '').slice(0, 5);
}

function selectTab(active) {
  const tabs = [
    ['pending', 'tabPending', 'panelPending'],
    ['history', 'tabHistory', 'panelHistory'],
    ['blocks', 'tabBlocks', 'panelBlocks'],
  ];
  for (const [key, tabId, panelId] of tabs) {
    const selected = key === active;
    $(tabId).setAttribute('aria-selected', selected ? 'true' : 'false');
    $(panelId).hidden = !selected;
  }
}

async function sendNotification(bookingId) {
  const { data, error } = await supabase.functions.invoke('notify-booking', {
    body: { bookingId },
  });
  if (error) throw new Error(error.message || 'No se pudo invocar el envío de correo.');
  if (data && data.ok === false) throw new Error(data.error || 'Error enviando el correo.');
  return data;
}

function renderPending() {
  const box = $('pendingList');
  box.innerHTML = '';
  const pending = allBookings
    .filter((b) => b.status === 'PENDIENTE')
    .sort((a, b) => a.booking_date.localeCompare(b.booking_date) || a.start_time.localeCompare(b.start_time));

  $('pendingCount').textContent = String(pending.length);

  if (!pending.length) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'No hay solicitudes pendientes en este momento.';
    box.appendChild(p);
    return;
  }

  for (const b of pending) {
    const card = document.createElement('article');
    card.className = 'admin-card';

    const header = document.createElement('div');
    header.className = 'bar';
    const title = document.createElement('strong');
    title.textContent = RESOURCE_LABELS[b.resource_id] || b.resource_id;
    const pill = document.createElement('span');
    pill.className = 'pill';
    pill.dataset.state = b.status;
    pill.textContent = 'Pendiente';
    header.append(title, pill);

    const meta = document.createElement('div');
    meta.className = 'admin-meta';
    const when = document.createElement('div');
    when.textContent = `Fecha y hora: ${formatDateShortEs(b.booking_date)} · ${shortTime(b.start_time)}–${shortTime(b.end_time)}`;
    const who = document.createElement('div');
    who.textContent = `Solicitante: ${b.requester_name} (${b.requester_email})`;
    meta.append(when, who);

    if (b.purpose) {
      const purpose = document.createElement('div');
      purpose.className = 'muted';
      purpose.textContent = `Actividad: ${b.purpose}`;
      meta.appendChild(purpose);
    }

    const noteField = document.createElement('div');
    noteField.className = 'field';
    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.maxLength = 500;
    noteInput.placeholder = 'Nota opcional para el correo al estudiante…';
    noteInput.setAttribute('aria-label', 'Nota opcional para el correo');
    noteField.appendChild(noteInput);

    const actions = document.createElement('div');
    actions.className = 'actions';
    const approveBtn = document.createElement('button');
    approveBtn.type = 'button';
    approveBtn.className = 'primary';
    approveBtn.textContent = 'Aprobar y avisar';

    const rejectBtn = document.createElement('button');
    rejectBtn.type = 'button';
    rejectBtn.className = 'danger';
    rejectBtn.textContent = 'Rechazar y avisar';

    const handleDecision = async (decision) => {
      approveBtn.disabled = true;
      rejectBtn.disabled = true;
      setStatus('Guardando resolución y enviando correo automático…', 'info');
      try {
        const { error } = await supabase.rpc('resolve_booking', {
          p_booking_id: b.id,
          p_decision: decision,
          p_note: noteInput.value.trim(),
        });
        if (error) throw new Error(error.message);

        let mailMsg = 'Correo automático enviado al estudiante.';
        let mailKind = 'ok';
        try {
          await sendNotification(b.id);
        } catch (mailErr) {
          mailMsg = `Reserva marcada como ${decision}, pero falló el envío automático del correo (${mailErr.message}). Puedes reintentarlo desde «Agenda e historial».`;
          mailKind = 'error';
        }
        await refreshData(mailMsg, mailKind);
      } catch (err) {
        setStatus(err?.message || 'No se pudo resolver la solicitud.', 'error');
        approveBtn.disabled = false;
        rejectBtn.disabled = false;
      }
    };

    approveBtn.addEventListener('click', () => handleDecision('APROBADA'));
    rejectBtn.addEventListener('click', () => handleDecision('RECHAZADA'));
    actions.append(approveBtn, rejectBtn);

    card.append(header, meta, noteField, actions);
    box.appendChild(card);
  }
}

function renderHistory() {
  const box = $('historyList');
  box.innerHTML = '';
  const filter = $('statusFilter').value;
  const list = allBookings
    .filter((b) => b.status !== 'PENDIENTE' && (filter === 'ALL' || b.status === filter))
    .sort((a, b) => b.booking_date.localeCompare(a.booking_date) || b.start_time.localeCompare(a.start_time))
    .slice(0, 150);

  if (!list.length) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'No hay registros para este filtro.';
    box.appendChild(p);
    return;
  }

  for (const b of list) {
    const card = document.createElement('article');
    card.className = 'admin-card';

    const header = document.createElement('div');
    header.className = 'bar';
    const title = document.createElement('strong');
    title.textContent = `${RESOURCE_LABELS[b.resource_id] || b.resource_id} · ${formatDateShortEs(b.booking_date)} (${shortTime(b.start_time)}–${shortTime(b.end_time)})`;

    const badges = document.createElement('div');
    badges.className = 'actions';
    const statePill = document.createElement('span');
    statePill.className = 'pill';
    statePill.dataset.state = b.status;
    statePill.textContent = b.status;

    const mailPill = document.createElement('span');
    mailPill.className = 'pill';
    mailPill.dataset.state = b.mail_status;
    mailPill.textContent =
      b.mail_status === 'ENVIADO'
        ? 'Correo enviado'
        : b.mail_status === 'ERROR'
          ? 'Error de correo'
          : 'Correo pendiente';
    badges.append(statePill, mailPill);
    header.append(title, badges);

    const meta = document.createElement('div');
    meta.className = 'admin-meta';
    const who = document.createElement('div');
    who.textContent = `${b.requester_name} (${b.requester_email})`;
    meta.appendChild(who);
    if (b.review_note) {
      const note = document.createElement('div');
      note.className = 'muted';
      note.textContent = `Nota: ${b.review_note}`;
      meta.appendChild(note);
    }
    if (b.mail_error) {
      const err = document.createElement('div');
      err.style.color = 'var(--err-ink)';
      err.textContent = `Detalle del correo: ${b.mail_error}`;
      meta.appendChild(err);
    }

    const actions = document.createElement('div');
    actions.className = 'actions';

    if (b.mail_status !== 'ENVIADO') {
      const resendBtn = document.createElement('button');
      resendBtn.type = 'button';
      resendBtn.textContent = 'Reenviar correo';
      resendBtn.addEventListener('click', async () => {
        resendBtn.disabled = true;
        try {
          await sendNotification(b.id);
          await refreshData('Correo reenviado correctamente.', 'ok');
        } catch (err) {
          setStatus('No se pudo reenviar el correo: ' + err.message, 'error');
          resendBtn.disabled = false;
        }
      });
      actions.appendChild(resendBtn);
    }

    if (b.status === 'APROBADA') {
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'danger';
      cancelBtn.textContent = 'Cancelar reserva';
      cancelBtn.addEventListener('click', async () => {
        const reason = window.prompt('Motivo de cancelación (opcional, se incluirá en el correo):', '') ?? '';
        cancelBtn.disabled = true;
        try {
          const { error } = await supabase.rpc('resolve_booking', {
            p_booking_id: b.id,
            p_decision: 'CANCELADA',
            p_note: reason,
          });
          if (error) throw new Error(error.message);
          try {
            await sendNotification(b.id);
            await refreshData('Reserva cancelada y aviso enviado al estudiante.', 'ok');
          } catch (mailErr) {
            await refreshData('Reserva cancelada, pero falló el correo: ' + mailErr.message, 'error');
          }
        } catch (err) {
          setStatus('No se pudo cancelar: ' + err.message, 'error');
          cancelBtn.disabled = false;
        }
      });
      actions.appendChild(cancelBtn);
    }

    card.append(header, meta);
    if (actions.children.length) card.appendChild(actions);
    box.appendChild(card);
  }
}

async function renderBlocks() {
  const box = $('blocksList');
  const today = formatMadridToday();
  const { data, error } = await supabase
    .from('blocks')
    .select('*')
    .gte('block_date', today)
    .order('block_date', { ascending: true })
    .order('start_time', { ascending: true });

  box.innerHTML = '';
  if (error) {
    box.textContent = 'Error cargando bloqueos: ' + error.message;
    return;
  }
  if (!data || !data.length) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'No hay bloqueos programados.';
    box.appendChild(p);
    return;
  }

  for (const bl of data) {
    const row = document.createElement('div');
    row.className = 'item slot';
    const info = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = `${TARGET_LABELS[bl.target] || bl.target} · ${formatDateShortEs(bl.block_date)} (${shortTime(bl.start_time)}–${shortTime(bl.end_time)})`;
    const sub = document.createElement('span');
    sub.className = 'muted';
    sub.textContent = bl.reason || 'Sin motivo especificado';
    info.append(title, sub);

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'danger';
    delBtn.textContent = 'Eliminar';
    delBtn.addEventListener('click', async () => {
      delBtn.disabled = true;
      const { error: delErr } = await supabase.from('blocks').delete().eq('id', bl.id);
      if (delErr) {
        setStatus('No se pudo eliminar el bloqueo: ' + delErr.message, 'error');
        delBtn.disabled = false;
        return;
      }
      await renderBlocks();
      setStatus('Bloqueo eliminado.', 'ok');
    });

    row.append(info, delBtn);
    box.appendChild(row);
  }
}

async function refreshData(statusMessage = '', statusKind = 'ok') {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(300);

  if (error) {
    setStatus('No se pudieron cargar las solicitudes: ' + error.message, 'error');
    return;
  }
  allBookings = data || [];
  renderPending();
  renderHistory();
  await renderBlocks();
  if (statusMessage) setStatus(statusMessage, statusKind);
}

async function checkSession() {
  if (!configured) {
    $('demoBanner').hidden = false;
    $('loginSection').hidden = true;
    $('adminPanel').hidden = true;
    return;
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.email) {
    $('loginSection').hidden = false;
    $('adminPanel').hidden = true;
    return;
  }

  currentUserEmail = session.user.email.toLowerCase();
  const { data: staffRow, error } = await supabase
    .from('staff_users')
    .select('email, display_name')
    .eq('email', currentUserEmail)
    .maybeSingle();

  if (error || !staffRow) {
    $('loginSection').hidden = false;
    $('adminPanel').hidden = true;
    setStatus(
      `La cuenta ${currentUserEmail} no está autorizada como personal de revisión. Si quieres reservar un laboratorio, vuelve al portal de reservas, o inicia sesión con una cuenta de personal.`,
      'error'
    );
    return;
  }

  $('loginSection').hidden = true;
  $('adminPanel').hidden = false;
  $('staffAccount').textContent = `Sesión iniciada: ${staffRow.display_name || currentUserEmail} (${currentUserEmail})`;
  $('blockDate').value = formatMadridToday();
  await refreshData();
}

$('googleStaffLoginBtn').addEventListener('click', async () => {
  if (!configured) return;
  const btn = $('googleStaffLoginBtn');
  btn.disabled = true;
  setStatus('Redirigiendo a Google (@go.ugr.es)…', 'info');
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + window.location.pathname,
      queryParams: {
        hd: 'go.ugr.es',
        prompt: 'select_account',
      },
    },
  });
  if (error) {
    btn.disabled = false;
    setStatus('No se pudo iniciar sesión con Google: ' + error.message, 'error');
  }
});

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  setStatus('Iniciando sesión…', 'info');
  const { error } = await supabase.auth.signInWithPassword({
    email: $('staffEmail').value.trim(),
    password: $('staffPassword').value,
  });
  if (error) {
    setStatus('No se pudo iniciar sesión: ' + error.message, 'error');
    return;
  }
  setStatus('');
  await checkSession();
});

$('magicLinkBtn').addEventListener('click', async () => {
  const email = $('staffEmail').value.trim();
  if (!email) {
    setStatus('Escribe primero tu correo del personal.', 'error');
    return;
  }
  setStatus('Enviando enlace de acceso…', 'info');
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href },
  });
  if (error) {
    setStatus('No se pudo enviar el enlace: ' + error.message, 'error');
    return;
  }
  setStatus('Te hemos enviado un enlace de acceso a ' + email + '. Ábrelo desde este mismo navegador.', 'ok');
});

$('blockForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('addBlockBtn');
  btn.disabled = true;
  const { error } = await supabase.from('blocks').insert({
    target: $('blockTarget').value,
    block_date: $('blockDate').value,
    start_time: $('blockStart').value,
    end_time: $('blockEnd').value,
    reason: $('blockReason').value.trim(),
    created_by: currentUserEmail,
  });
  btn.disabled = false;
  if (error) {
    setStatus('No se pudo crear el bloqueo: ' + error.message, 'error');
    return;
  }
  $('blockReason').value = '';
  await renderBlocks();
  setStatus('Bloqueo guardado correctamente.', 'ok');
});

$('logoutBtn').addEventListener('click', async () => {
  await supabase.auth.signOut();
  $('adminPanel').hidden = true;
  $('loginSection').hidden = false;
  setStatus('Sesión cerrada.', 'info');
});

$('refreshAll').addEventListener('click', () => refreshData('Datos actualizados.', 'info'));
$('statusFilter').addEventListener('change', renderHistory);
$('tabPending').addEventListener('click', () => selectTab('pending'));
$('tabHistory').addEventListener('click', () => selectTab('history'));
$('tabBlocks').addEventListener('click', () => selectTab('blocks'));

if (supabase) {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN') checkSession();
  });
}

checkSession();
