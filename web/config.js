// Configuración de conexión a Supabase para PoliSocioLAB.
// Son claves públicas pensadas para el navegador; la seguridad real está en las políticas RLS de PostgreSQL.

export const CONFIG = {
  SUPABASE_URL: 'https://hccmcdqimgyylwcrcaeo.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjY21jZHFpbWd5eWx3Y3JjYWVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUxMDE4NDYsImV4cCI6MjExMDY3Nzg0Nn0.ZqSuGm5eSKPHxEkHFghLJwFftDZPe3Oba2ZZxvxegC4',
};

export function isConfigured() {
  return (
    Boolean(CONFIG.SUPABASE_URL) &&
    Boolean(CONFIG.SUPABASE_ANON_KEY) &&
    !CONFIG.SUPABASE_URL.includes('TU-PROYECTO') &&
    !CONFIG.SUPABASE_ANON_KEY.includes('TU-SUPABASE')
  );
}
