// Configuración de conexión a Supabase para PoliSocioLAB.
// Sustituye estos dos valores por la Project URL y la Publishable/Anon Key de tu proyecto Supabase
// (son claves públicas pensadas para ir en el navegador; la seguridad real está en las políticas RLS de PostgreSQL).

export const CONFIG = {
  SUPABASE_URL: 'https://TU-PROYECTO.supabase.co',
  SUPABASE_ANON_KEY: 'TU-SUPABASE-ANON-KEY',
};

export function isConfigured() {
  return (
    Boolean(CONFIG.SUPABASE_URL) &&
    Boolean(CONFIG.SUPABASE_ANON_KEY) &&
    !CONFIG.SUPABASE_URL.includes('TU-PROYECTO') &&
    !CONFIG.SUPABASE_ANON_KEY.includes('TU-SUPABASE')
  );
}
