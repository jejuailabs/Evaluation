declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    AUTH_PROVIDER?: string;
    SUPABASE_URL?: string;
    SUPABASE_PUBLISHABLE_KEY?: string;
    APP_URL?: string;
    PLATFORM_ADMIN_USER_IDS?: string;
  }
}
