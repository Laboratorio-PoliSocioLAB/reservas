import { createClient } from './vendor/supabase-js.mjs';
import { CONFIG, isConfigured } from './config.js';
import {
  RESOURCE_LABELS,
  isValidGoUgrEmail,
  getGoogleIdentityDisplayName,
  getSafeGoogleAvatarUrl,
  renderUserAvatar,
  formatDateShortEs,
  formatMadridToday,
  initDialogLightDismissFallback,
  initAccessibleValidation,
} from './shared.js';

const $ = (id) => document.getElementById(id);
const configured = isConfigured();
const supabase = configured
  ? createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: true,
      },
    })
  : null;

const TARGET_LABELS = {
  ...RESOURCE_LABELS,
  CUALITATIVO2: 'Laboratorio cualitativo 2 (todas las plazas)',
};

const STATUS_LABELS = {
  PENDIENTE: 'Pendiente',
  APROBADA: 'Aprobada',
  RECHAZADA: 'Rechazada',
  CANCELADA: 'Cancelada',
};

const SECTION_COPY = {
  pending: {
    title: 'Solicitudes pendientes de revisión',
    sub: 'Revisa cada petición y añade un comentario opcional antes de aprobar o rechazar.',
  },
  history: {
    title: 'Agenda e historial de reservas',
    sub: 'Filtra por estado o busca por solicitante para consultar reservas resueltas, reenviar avisos o cancelar.',
  },
  blocks: {
    title: 'Bloqueos de horario',
    sub: 'Programa franjas no disponibles por mantenimiento, docencia o eventos de la Facultad.',
  },
};

const VALID_TABS = ['pending', 'history', 'blocks'];
const VALID_FILTERS = ['ALL', 'APROBADA', 'RECHAZADA', 'CANCELADA', 'MAIL_ERROR'];

let activeTab = 'pending';
let pendingBookings = [];
let historyBookings = [];
let activeBlocksCount = 0;
let currentUserEmail = '';

function readInitialAdminParams() {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab');
  const status = params.get('status');
  const q = params.get('q');
  if (tab && VALID_TABS.includes(tab)) activeTab = tab;
  if (status && VALID_FILTERS.includes(status)) {
    $('statusFilter').value = status;
  }
  if (typeof q === 'string' && q.trim()) {
    $('historySearch').value = q.trim();
  }
}

function syncAdminUrl() {
  const current = new URLSearchParams(window.location.search);
  if (current.has('code') || current.has('error')) return;
  const next = new URLSearchParams();
  next.set('tab', activeTab);
  if (activeTab === 'history') {
    if ($('statusFilter').value !== 'ALL') {
      next.set('status', $('statusFilter').value);
    }
    const q = $('historySearch').value.trim();
    if (q) next.set('q', q);
  }
  window.history.replaceState(null, '', `${window.location.pathname}?${next.toString()}`);
}

function setStatus(message, kind = 'info') {
  const el = $('status');
  if (!message) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.dataset.kind = kind;
  el.textContent = message;
}

function shortTime(t) {
  return String(t || '').slice(0, 5);
}

function selectTab(active, { focusTab = false } = {}) {
  if (!VALID_TABS.includes(active)) return;
  activeTab = active;
  const tabs = [
    ['pending', 'tabPending', 'panelPending'],
    ['history', 'tabHistory', 'panelHistory'],
    ['blocks', 'tabBlocks', 'panelBlocks'],
  ];
  for (const [key, tabId, panelId] of tabs) {
    const selected = key === active;
    const tabEl = $(tabId);
    tabEl.setAttribute('aria-selected', selected ? 'true' : 'false');
    tabEl.tabIndex = selected ? 0 : -1;
    $(panelId).hidden = !selected;
    if (selected && focusTab) tabEl.focus();
  }
  $('adminSectionTitle').textContent = SECTION_COPY[active].title;
  $('adminSectionSub').textContent = SECTION_COPY[active].sub;
  syncAdminUrl();
}

function updateKpis() {
  const today = formatMadridToday();
  const approvedToday = historyBookings.filter(
    (b) => b.status === 'APROBADA' && b.booking_date === today
  ).length;
  const mailErrors = historyBookings.filter((b) => b.mail_status === 'ERROR').length;

  $('pendingCount').textContent = String(pendingBookings.length);
  $('historyCount').textContent = String(historyBookings.length);
  $('blocksCount').textContent = String(activeBlocksCount);

  $('kpiPending').textContent = String(pendingBookings.length);
  $('kpiApprovedToday').textContent = String(approvedToday);
  $('kpiMailErrors').textContent = String(mailErrors);
}

async function sendNotification(bookingId) {
  const { data, error } = await supabase.functions.invoke('notify-booking', {
    body: { bookingId },
  });
  if (error) throw new Error(error.message || 'No se pudo invocar el envío de correo.');
  if (data && data.ok === false) throw new Error(data.error || 'Error enviando el correo.');
  return data;
}

function openCancelDialog(booking) {
  const dialog = $('cancelDialog');
  const form = $('cancelForm');
  const reasonInput = $('cancelReason');
  form.reset();
  dialog.returnValue = '';
  $('cancelMeta').textContent =
    `${RESOURCE_LABELS[booking.resource_id] || booking.resource_id} · ${formatDateShortEs(booking.booking_date)} (${shortTime(booking.start_time)}–${shortTime(booking.end_time)}) · ${booking.requester_name}`;

  return new Promise((resolve) => {
    const onClose = () => {
      const choice = dialog.returnValue;
      dialog.returnValue = '';
      if (choice === 'confirm') {
        resolve(reasonInput.value.trim());
      } else {
        resolve(null);
      }
    };
    dialog.addEventListener('close', onClose, { once: true });
    dialog.showModal();
  });
}

function openDeleteBlockDialog(block) {
  const dialog = $('deleteBlockDialog');
  dialog.returnValue = '';
  $('deleteBlockMeta').textContent =
    `${TARGET_LABELS[block.target] || block.target} · ${formatDateShortEs(block.block_date)} (${shortTime(block.start_time)}–${shortTime(block.end_time)})`;

  return new Promise((resolve) => {
    const onClose = () => {
      const choice = dialog.returnValue;
      dialog.returnValue = '';
      resolve(choice === 'confirm');
    };
    dialog.addEventListener('close', onClose, { once: true });
    dialog.showModal();
  });
}

function renderEmpty(container, heading, copy, actionLabel = '', onAction = null) {
  const wrap = document.createElement('div');
  wrap.className = 'empty-state';
  const strong = document.createElement('strong');
  strong.textContent = heading;
  const p = document.createElement('p');
  p.textContent = copy;
  wrap.append(strong, p);
  if (actionLabel && onAction) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = actionLabel;
    btn.addEventListener('click', onAction);
    wrap.appendChild(btn);
  }
  container.appendChild(wrap);
}

function hasUnsavedAdminInput() {
  if ($('blockReason').value.trim().length > 0) return true;
  if ($('cancelDialog').open && $('cancelReason').value.trim().length > 0) return true;
  for (const input of document.querySelectorAll('#pendingList input[name="review_note"]')) {
    if (input.value.trim().length > 0) return true;
  }
  return false;
}

window.addEventListener('beforeunload', (e) => {
  if (hasUnsavedAdminInput()) e.preventDefault();
});

function renderPending() {
  const box = $('pendingList');
  box.replaceChildren();
  const pending = [...pendingBookings].sort(
    (a, b) => a.booking_date.localeCompare(b.booking_date) || a.start_time.localeCompare(b.start_time)
  );

  if (!pending.length) {
    renderEmpty(
      box,
      'No hay solicitudes pendientes',
      'Todas las peticiones han sido revisadas. Pulsa «Actualizar datos» para comprobar nuevas entradas.'
    );
    return;
  }

  for (const b of pending) {
    const row = document.createElement('article');
    row.className = 'admin-row';

    const header = document.createElement('div');
    header.className = 'admin-row-head';
    const title = document.createElement('strong');
    title.className = 'admin-row-title';
    title.textContent = `${RESOURCE_LABELS[b.resource_id] || b.resource_id} · ${formatDateShortEs(b.booking_date)} (${shortTime(b.start_time)}–${shortTime(b.end_time)})`;

    const tag = document.createElement('span');
    tag.className = 'status-tag';
    tag.dataset.state = b.status;
    tag.textContent = STATUS_LABELS[b.status] || b.status;
    header.append(title, tag);

    const details = document.createElement('div');
    details.className = 'admin-details';
    const who = document.createElement('div');
    who.textContent = `Solicitante: ${b.requester_name} (${b.requester_email})`;
    details.appendChild(who);

    if (b.purpose) {
      const purpose = document.createElement('div');
      purpose.className = 'muted';
      purpose.textContent = `Actividad: ${b.purpose}`;
      details.appendChild(purpose);
    }

    const decisionBar = document.createElement('div');
    decisionBar.className = 'admin-decision-bar';

    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.name = 'review_note';
    noteInput.maxLength = 500;
    noteInput.autocomplete = 'off';
    noteInput.placeholder = 'Comentario opcional para el correo al estudiante…';
    noteInput.setAttribute('aria-label', `Comentario opcional para ${b.requester_name}`);

    const actions = document.createElement('div');
    actions.className = 'admin-actions';
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
      const activeBtn = decision === 'APROBADA' ? approveBtn : rejectBtn;
      const prevText = activeBtn.textContent;
      activeBtn.setAttribute('aria-busy', 'true');
      activeBtn.textContent = 'Guardando…';
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
          mailMsg = `Reserva marcada como ${STATUS_LABELS[decision] || decision}, pero falló el envío automático del correo (${mailErr.message}). Reinténtalo desde «Agenda e historial».`;
          mailKind = 'error';
        }
        await refreshData(mailMsg, mailKind);
      } catch (err) {
        setStatus(
          `${err?.message || 'No se pudo resolver la solicitud.'} Actualiza los datos e inténtalo de nuevo.`,
          'error'
        );
        approveBtn.disabled = false;
        rejectBtn.disabled = false;
        activeBtn.removeAttribute('aria-busy');
        activeBtn.textContent = prevText;
      }
    };

    approveBtn.addEventListener('click', () => handleDecision('APROBADA'));
    rejectBtn.addEventListener('click', () => handleDecision('RECHAZADA'));
    actions.append(approveBtn, rejectBtn);
    decisionBar.append(noteInput, actions);

    row.append(header, details, decisionBar);
    box.appendChild(row);
  }
}

function renderHistory() {
  const box = $('historyList');
  box.replaceChildren();
  const filter = $('statusFilter').value;
  const query = $('historySearch').value.trim().toLowerCase();

  const list = historyBookings
    .filter((b) => {
      if (filter === 'MAIL_ERROR') {
        if (b.mail_status !== 'ERROR') return false;
      } else if (filter !== 'ALL' && b.status !== filter) {
        return false;
      }
      if (!query) return true;
      const haystack = `${b.requester_name} ${b.requester_email} ${b.purpose || ''} ${RESOURCE_LABELS[b.resource_id] || b.resource_id}`.toLowerCase();
      return haystack.includes(query);
    })
    .sort((a, b) => b.booking_date.localeCompare(a.booking_date) || b.start_time.localeCompare(a.start_time))
    .slice(0, 150);

  if (!list.length) {
    renderEmpty(
      box,
      'No hay registros que coincidan',
      'Prueba a cambiar el filtro de estado o limpiar el término de búsqueda.',
      filter !== 'ALL' || query ? 'Limpiar filtros' : '',
      () => {
        $('statusFilter').value = 'ALL';
        $('historySearch').value = '';
        syncAdminUrl();
        renderHistory();
      }
    );
    return;
  }

  for (const b of list) {
    const row = document.createElement('article');
    row.className = 'admin-row';

    const header = document.createElement('div');
    header.className = 'admin-row-head';
    const title = document.createElement('strong');
    title.className = 'admin-row-title';
    title.textContent = `${RESOURCE_LABELS[b.resource_id] || b.resource_id} · ${formatDateShortEs(b.booking_date)} (${shortTime(b.start_time)}–${shortTime(b.end_time)})`;

    const badges = document.createElement('div');
    badges.className = 'admin-badges';
    const stateTag = document.createElement('span');
    stateTag.className = 'status-tag';
    stateTag.dataset.state = b.status;
    stateTag.textContent = STATUS_LABELS[b.status] || b.status;

    const mailTag = document.createElement('span');
    mailTag.className = 'status-tag';
    mailTag.dataset.state = b.mail_status;
    mailTag.textContent =
      b.mail_status === 'ENVIADO'
        ? 'Correo enviado'
        : b.mail_status === 'ERROR'
          ? 'Error de correo'
          : 'Correo pendiente';
    badges.append(stateTag, mailTag);
    header.append(title, badges);

    const details = document.createElement('div');
    details.className = 'admin-details';
    const who = document.createElement('div');
    who.textContent = `${b.requester_name} (${b.requester_email})`;
    details.appendChild(who);
    if (b.purpose) {
      const purpose = document.createElement('div');
      purpose.className = 'muted';
      purpose.textContent = `Actividad: ${b.purpose}`;
      details.appendChild(purpose);
    }
    if (b.review_note) {
      const note = document.createElement('div');
      note.className = 'muted';
      note.textContent = `Comentario: ${b.review_note}`;
      details.appendChild(note);
    }
    if (b.mail_error) {
      const err = document.createElement('div');
      err.className = 'mail-error';
      err.textContent = `Detalle del correo: ${b.mail_error}`;
      details.appendChild(err);
    }

    const actions = document.createElement('div');
    actions.className = 'admin-actions';

    if (b.mail_status !== 'ENVIADO') {
      const resendBtn = document.createElement('button');
      resendBtn.type = 'button';
      resendBtn.textContent = 'Reenviar correo';
      resendBtn.addEventListener('click', async () => {
        resendBtn.disabled = true;
        resendBtn.setAttribute('aria-busy', 'true');
        resendBtn.textContent = 'Reenviando…';
        try {
          await sendNotification(b.id);
          await refreshData('Correo reenviado correctamente.', 'ok');
        } catch (err) {
          setStatus(`No se pudo reenviar el correo (${err.message}). Espera unos segundos y vuelve a intentarlo.`, 'error');
          resendBtn.disabled = false;
          resendBtn.removeAttribute('aria-busy');
          resendBtn.textContent = 'Reenviar correo';
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
        const reason = await openCancelDialog(b);
        if (reason === null) return;
        cancelBtn.disabled = true;
        cancelBtn.setAttribute('aria-busy', 'true');
        cancelBtn.textContent = 'Cancelando…';
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
            await refreshData(
              `Reserva cancelada, pero falló el correo (${mailErr.message}). Reinténtalo con «Reenviar correo».`,
              'error'
            );
          }
        } catch (err) {
          setStatus(`No se pudo cancelar (${err.message}). Actualiza los datos e inténtalo de nuevo.`, 'error');
          cancelBtn.disabled = false;
          cancelBtn.removeAttribute('aria-busy');
          cancelBtn.textContent = 'Cancelar reserva';
        }
      });
      actions.appendChild(cancelBtn);
    }

    row.append(header, details);
    if (actions.children.length) row.appendChild(actions);
    box.appendChild(row);
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

  box.replaceChildren();
  if (error) {
    renderEmpty(
      box,
      'Error cargando bloqueos',
      `${error.message} Pulsa «Actualizar datos» para reintentarlo.`
    );
    return;
  }

  activeBlocksCount = (data || []).length;
  updateKpis();

  if (!data || !data.length) {
    renderEmpty(
      box,
      'No hay bloqueos programados',
      'Usa el formulario superior para reservar una franja por mantenimiento o actividad docente.'
    );
    return;
  }

  for (const bl of data) {
    const row = document.createElement('div');
    row.className = 'block-row';
    const copy = document.createElement('div');
    copy.className = 'block-row-copy';
    const title = document.createElement('strong');
    title.textContent = `${TARGET_LABELS[bl.target] || bl.target} · ${formatDateShortEs(bl.block_date)} (${shortTime(bl.start_time)}–${shortTime(bl.end_time)})`;
    const sub = document.createElement('span');
    sub.className = 'muted';
    sub.textContent = bl.reason || 'Sin motivo especificado';
    copy.append(title, sub);

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'danger';
    delBtn.textContent = 'Eliminar';
    delBtn.addEventListener('click', async () => {
      const confirmed = await openDeleteBlockDialog(bl);
      if (!confirmed) return;
      delBtn.disabled = true;
      delBtn.setAttribute('aria-busy', 'true');
      delBtn.textContent = 'Eliminando…';
      const { error: delErr } = await supabase.from('blocks').delete().eq('id', bl.id);
      if (delErr) {
        setStatus(`No se pudo eliminar el bloqueo (${delErr.message}). Actualiza e inténtalo de nuevo.`, 'error');
        delBtn.disabled = false;
        delBtn.removeAttribute('aria-busy');
        delBtn.textContent = 'Eliminar';
        return;
      }
      await renderBlocks();
      setStatus('Bloqueo eliminado.', 'ok');
    });

    row.append(copy, delBtn);
    box.appendChild(row);
  }
}

async function refreshData(statusMessage = '', statusKind = 'ok') {
  const [pendingRes, historyRes] = await Promise.all([
    supabase
      .from('bookings')
      .select('*')
      .eq('status', 'PENDIENTE')
      .order('booking_date', { ascending: true })
      .order('start_time', { ascending: true }),
    supabase
      .from('bookings')
      .select('*')
      .neq('status', 'PENDIENTE')
      .order('created_at', { ascending: false })
      .limit(300),
  ]);

  if (pendingRes.error || historyRes.error) {
    const err = pendingRes.error || historyRes.error;
    setStatus(`No se pudieron cargar las solicitudes (${err.message}). Comprueba tu conexión y pulsa «Actualizar datos».`, 'error');
    return;
  }

  pendingBookings = pendingRes.data || [];
  historyBookings = historyRes.data || [];
  updateKpis();
  renderPending();
  renderHistory();
  await renderBlocks();
  if (statusMessage) setStatus(statusMessage, statusKind);
}

async function checkSession() {
  if (!configured) {
    $('demoBanner').hidden = false;
    $('unconfiguredState').hidden = false;
    $('topbarStaffActions').hidden = true;
    $('loginSection').hidden = true;
    $('adminPanel').hidden = true;
    return;
  }

  $('unconfiguredState').hidden = true;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.email) {
    currentUserEmail = '';
    $('topbarStaffActions').hidden = true;
    $('loginSection').hidden = false;
    $('adminPanel').hidden = true;
    return;
  }

  currentUserEmail = session.user.email.trim().toLowerCase();
  if (!isValidGoUgrEmail(currentUserEmail)) {
    await supabase.auth.signOut();
    currentUserEmail = '';
    $('topbarStaffActions').hidden = true;
    $('loginSection').hidden = false;
    $('adminPanel').hidden = true;
    setStatus(
      'El acceso está restringido a cuentas institucionales de Google (@go.ugr.es) autorizadas como personal. Selecciona tu cuenta @go.ugr.es.',
      'error'
    );
    return;
  }

  const { data: staffRow, error } = await supabase
    .from('staff_users')
    .select('email, display_name')
    .eq('email', currentUserEmail)
    .maybeSingle();

  if (error || !staffRow) {
    $('topbarStaffActions').hidden = true;
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
  $('topbarStaffActions').hidden = false;
  const displayName = staffRow.display_name || getGoogleIdentityDisplayName(session.user) || currentUserEmail;
  $('staffName').textContent = displayName;
  $('staffAccount').textContent = currentUserEmail;
  renderUserAvatar($('staffAvatarSlot'), $('staffAvatarFallback'), {
    avatarUrl: getSafeGoogleAvatarUrl(session.user),
    name: displayName,
    email: currentUserEmail,
  });
  $('blockDate').value = formatMadridToday();
  selectTab(activeTab);
  await refreshData();
}

$('googleStaffLoginBtn').addEventListener('click', async () => {
  if (!configured) return;
  const btn = $('googleStaffLoginBtn');
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
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
    btn.removeAttribute('aria-busy');
    setStatus(`No se pudo iniciar sesión con Google (${error.message}). Reinténtalo o comprueba tu conexión.`, 'error');
  }
});

function validateBlockTimes() {
  const start = $('blockStart').value;
  const endInput = $('blockEnd');
  if (start && endInput.value && endInput.value <= start) {
    endInput.setCustomValidity('La hora de fin debe ser posterior a la hora de inicio.');
  } else {
    endInput.setCustomValidity('');
  }
}

$('blockStart').addEventListener('change', validateBlockTimes);
$('blockEnd').addEventListener('change', validateBlockTimes);
$('blockEnd').addEventListener('input', () => $('blockEnd').setCustomValidity(''));

$('blockForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  validateBlockTimes();
  const form = e.currentTarget;
  if (!form.checkValidity()) {
    const firstInvalid = form.querySelector(':invalid');
    if (firstInvalid) {
      firstInvalid.dispatchEvent(new Event('invalid', { cancelable: true }));
      firstInvalid.focus();
    }
    return;
  }

  const btn = $('addBlockBtn');
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  const prevText = btn.textContent;
  btn.textContent = 'Guardando…';
  const { error } = await supabase.from('blocks').insert({
    target: $('blockTarget').value,
    block_date: $('blockDate').value,
    start_time: $('blockStart').value,
    end_time: $('blockEnd').value,
    reason: $('blockReason').value.trim(),
    created_by: currentUserEmail,
  });
  btn.disabled = false;
  btn.removeAttribute('aria-busy');
  btn.textContent = prevText;
  if (error) {
    setStatus(`No se pudo crear el bloqueo (${error.message}). Revisa el horario e inténtalo de nuevo.`, 'error');
    return;
  }
  $('blockReason').value = '';
  await renderBlocks();
  setStatus('Bloqueo guardado correctamente.', 'ok');
});

$('logoutBtn').addEventListener('click', async () => {
  await supabase.auth.signOut();
  currentUserEmail = '';
  $('topbarStaffActions').hidden = true;
  $('adminPanel').hidden = true;
  $('loginSection').hidden = false;
  setStatus('Sesión cerrada.', 'info');
});

$('refreshAll').addEventListener('click', () => refreshData('Datos actualizados.', 'info'));
$('statusFilter').addEventListener('change', () => {
  syncAdminUrl();
  renderHistory();
});
$('historySearch').addEventListener('input', () => {
  syncAdminUrl();
  renderHistory();
});

$('tabPending').addEventListener('click', () => selectTab('pending'));
$('tabHistory').addEventListener('click', () => selectTab('history'));
$('tabBlocks').addEventListener('click', () => selectTab('blocks'));

// Navegación por teclado estándar de ARIA tablist (flechas, Inicio, Fin)
const tabOrder = ['pending', 'history', 'blocks'];
const tabElements = [$('tabPending'), $('tabHistory'), $('tabBlocks')];
for (let i = 0; i < tabElements.length; i++) {
  tabElements[i].addEventListener('keydown', (e) => {
    let nextIdx = -1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') nextIdx = (i + 1) % tabOrder.length;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') nextIdx = (i - 1 + tabOrder.length) % tabOrder.length;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = tabOrder.length - 1;
    if (nextIdx >= 0) {
      e.preventDefault();
      selectTab(tabOrder[nextIdx], { focusTab: true });
    }
  });
}

$('kpiPendingBtn').addEventListener('click', () => selectTab('pending'));
$('kpiTodayBtn').addEventListener('click', () => {
  $('statusFilter').value = 'APROBADA';
  selectTab('history');
  renderHistory();
});
$('kpiMailErrBtn').addEventListener('click', () => {
  $('statusFilter').value = 'MAIL_ERROR';
  selectTab('history');
  renderHistory();
});

readInitialAdminParams();
initDialogLightDismissFallback();
initAccessibleValidation();

if (supabase) {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') checkSession();
  });
}

checkSession();
