// Utilidades compartidas (fechas, validación de dominio *ugr.es, duración consecutiva y accesibilidad)

export const UGR_EMAIL_PATTERN = '^[a-zA-Z0-9][a-zA-Z0-9._+\\-]{0,63}@([a-zA-Z0-9\\-]+\\.)*ugr\\.es$';
export const UGR_EMAIL_REGEX = new RegExp(UGR_EMAIL_PATTERN, 'i');

export const GO_UGR_EMAIL_PATTERN = '^[a-zA-Z0-9][a-zA-Z0-9._+\\-]{0,63}@go\\.ugr\\.es$';
export const GO_UGR_EMAIL_REGEX = new RegExp(GO_UGR_EMAIL_PATTERN, 'i');

export const ROOM_NAMES = {
  RADIO: 'Laboratorio de radio',
  CUALITATIVO1: 'Laboratorio cualitativo 1',
  CUALITATIVO2: 'Laboratorio cualitativo 2',
};

export const RESOURCE_LABELS = Object.fromEntries([
  ['RADIO', 'Laboratorio de radio'],
  ['CUALITATIVO1', 'Laboratorio cualitativo 1'],
  ['CUALITATIVO2', 'Laboratorio cualitativo 2'],
  ...Array.from({ length: 10 }, (_, i) => {
    const num = String(i + 1).padStart(2, '0');
    return ['C' + num, 'Laboratorio cualitativo 2'];
  }),
]);

export function isValidUgrEmail(value) {
  return UGR_EMAIL_REGEX.test(String(value || '').trim());
}

export function isValidGoUgrEmail(value) {
  return GO_UGR_EMAIL_REGEX.test(String(value || '').trim());
}

export function getSafeGoogleAvatarUrl(user) {
  const raw = String(user?.user_metadata?.avatar_url || user?.user_metadata?.picture || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') return '';
    const host = parsed.hostname.toLowerCase();
    const isGoogleHost =
      host === 'googleusercontent.com' ||
      host.endsWith('.googleusercontent.com') ||
      host === 'google.com' ||
      host.endsWith('.google.com');
    return isGoogleHost ? parsed.href : '';
  } catch {
    return '';
  }
}

export function renderUserAvatar(imgEl, fallbackEl, { avatarUrl = '', name = '', email = '' } = {}) {
  if (!imgEl || !fallbackEl) return;
  const initial = (String(name || email || '?').trim().charAt(0) || '?').toUpperCase();
  fallbackEl.textContent = initial;

  const showFallback = () => {
    imgEl.hidden = true;
    imgEl.removeAttribute('src');
    fallbackEl.hidden = false;
  };

  if (!avatarUrl) {
    showFallback();
    return;
  }

  imgEl.onerror = showFallback;
  imgEl.alt = name ? `Foto de perfil de ${name}` : 'Foto de perfil';
  imgEl.src = avatarUrl;
  imgEl.hidden = false;
  fallbackEl.hidden = true;
}

export function parseUtcDate(iso) {
  return new Date(iso + 'T00:00:00Z');
}

export function addDays(iso, delta) {
  const d = parseUtcDate(iso);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function mondayOf(iso) {
  const d = parseUtcDate(iso);
  const isoDay = d.getUTCDay() || 7;
  return addDays(iso, -(isoDay - 1));
}

export function computeConsecutiveHours(slots, room, start, resourceId, maxHours = 6) {
  const roomSlots = (slots || []).filter((s) => s.room === room);
  const isCapacityPool = room === 'CUALITATIVO2' && resourceId === 'CUALITATIVO2';
  let cursor = start;
  let sharedCandidates = null;
  const options = [];
  for (let h = 1; h <= maxHours; h++) {
    const next = roomSlots.find((s) => s.start === cursor);
    if (!next || !Array.isArray(next.available)) break;

    if (isCapacityPool) {
      sharedCandidates =
        sharedCandidates === null
          ? [...next.available]
          : sharedCandidates.filter((id) => next.available.includes(id));
      if (!sharedCandidates.length) break;
    } else if (!next.available.includes(resourceId)) {
      break;
    }

    options.push({
      hours: h,
      start,
      end: next.end,
      label: (h === 1 ? '1 hora' : `${h} horas`) + ` (${start}–${next.end})`,
    });
    cursor = next.end;
  }
  return options;
}

export function formatMadridToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export function formatDateLongEs(iso) {
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parseUtcDate(iso));
}

export function formatWeekdayShortEs(iso) {
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'short',
    timeZone: 'UTC',
  })
    .format(parseUtcDate(iso))
    .replace('.', '');
}

export function formatDateShortEs(iso) {
  const [y, m, d] = String(iso || '').split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

// Fallback de light-dismiss para navegadores sin <dialog closedby="any"> (p. ej. Safari)
export function initDialogLightDismissFallback(root = document) {
  if (typeof HTMLDialogElement === 'undefined') return;
  if ('closedBy' in HTMLDialogElement.prototype) return;

  const isOutside = (e, dialog) => {
    const r = dialog.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };

  for (const dialog of root.querySelectorAll('dialog[closedby="any"]')) {
    let pressedOutside = false;
    dialog.addEventListener('pointerdown', (e) => {
      pressedOutside = isOutside(e, dialog);
    });
    dialog.addEventListener('pointerup', (e) => {
      if (pressedOutside && isOutside(e, dialog)) dialog.close();
      pressedOutside = false;
    });
  }
}

// Sincronización de aria-invalid, aria-describedby y live region con :user-invalid
export function initAccessibleValidation(root = document) {
  if (typeof document === 'undefined') return;

  const supportsUserInvalid = typeof CSS !== 'undefined' && CSS.supports?.('selector(:user-invalid)');
  const dirtyState = new WeakMap();
  const flagged = new WeakSet();
  const announced = new WeakSet();

  const announcer = document.createElement('div');
  announcer.setAttribute('aria-live', 'polite');
  announcer.classList.add('visually-hidden');
  document.body.append(announcer);

  let announceTimer;
  let announcedField;

  const linkError = (el, shown) => {
    const errorId = el.dataset.error;
    if (!errorId) return;
    const ids = (el.getAttribute('aria-describedby') || '')
      .split(/\s+/)
      .filter((id) => id && id !== errorId);
    if (shown) ids.push(errorId);
    if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
    else el.removeAttribute('aria-describedby');
  };

  const spokenText = (node) => {
    const copy = node.cloneNode(true);
    copy.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
    copy.querySelectorAll('[role="img"][aria-label]').forEach((n) => {
      n.replaceWith(`${n.getAttribute('aria-label')}: `);
    });
    return copy.textContent.replace(/\s+/g, ' ').trim();
  };

  const announceError = (el) => {
    const error = document.getElementById(el.dataset.error || '');
    if (!error) return;
    const label = el.labels?.[0] ? `${spokenText(el.labels[0])}: ` : '';
    clearTimeout(announceTimer);
    announcer.textContent = '';
    announcedField = el;
    announceTimer = setTimeout(() => {
      announcer.textContent = label + spokenText(error);
    }, 500);
  };

  const syncAria = (el, announce = false) => {
    if (!el?.matches?.('input, select, textarea')) return;
    const invalid = supportsUserInvalid
      ? el.matches(':user-invalid')
      : el.classList.contains('user-invalid-fallback');
    if (invalid) {
      if (announce && !announced.has(el)) {
        announceError(el);
        announced.add(el);
      }
      el.setAttribute('aria-invalid', 'true');
      linkError(el, true);
      flagged.add(el);
    } else if (flagged.has(el) || el.getAttribute('aria-invalid') !== 'true') {
      el.setAttribute('aria-invalid', 'false');
      linkError(el, false);
      flagged.delete(el);
      announced.delete(el);
      if (announcedField === el) {
        clearTimeout(announceTimer);
        announcer.textContent = '';
      }
    }
  };

  const updateFallback = (el) => {
    if (supportsUserInvalid || !el?.checkValidity) return;
    const valid = el.validity.valid;
    el.classList.toggle('user-invalid-fallback', !valid);
    el.classList.toggle('user-valid-fallback', valid);
  };

  root.querySelectorAll('input, select, textarea').forEach((el) => syncAria(el));

  root.addEventListener(
    'blur',
    (e) => {
      const el = e.target;
      if (!supportsUserInvalid && el?.checkValidity) {
        const s = dirtyState.get(el) || { hasInteracted: false, hasBlurred: false };
        s.hasBlurred = true;
        dirtyState.set(el, s);
        if (s.hasInteracted) updateFallback(el);
      }
      syncAria(el, true);
    },
    true
  );

  root.addEventListener('input', (e) => {
    const el = e.target;
    if (!supportsUserInvalid && el?.checkValidity) {
      const s = dirtyState.get(el) || { hasInteracted: false, hasBlurred: false };
      s.hasInteracted = true;
      dirtyState.set(el, s);
      if (s.hasBlurred) updateFallback(el);
    }
    if (el?.hasAttribute?.('aria-invalid')) syncAria(el);
  });

  root.addEventListener(
    'change',
    (e) => {
      const el = e.target;
      if (!supportsUserInvalid && el?.checkValidity) {
        const s = dirtyState.get(el) || { hasInteracted: false, hasBlurred: false };
        s.hasInteracted = true;
        dirtyState.set(el, s);
        if (s.hasBlurred) updateFallback(el);
      }
      syncAria(el, true);
    },
    true
  );

  root.addEventListener(
    'invalid',
    (e) => {
      const el = e.target;
      if (!supportsUserInvalid && el?.checkValidity) {
        dirtyState.set(el, { hasInteracted: true, hasBlurred: true });
        updateFallback(el);
      }
      announced.add(el);
      syncAria(el);
    },
    true
  );

  root.addEventListener(
    'reset',
    (e) => {
      const form = e.target;
      setTimeout(() => {
        for (const el of form.elements || []) {
          dirtyState.delete(el);
          el.classList?.remove('user-invalid-fallback', 'user-valid-fallback');
          syncAria(el);
        }
      });
    },
    true
  );
}
