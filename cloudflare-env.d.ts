declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}

interface CloudflareEnvSecrets {OPENROUTER_API_KEY?:string;OPENROUTER_MODEL?:string;}
declare namespace Cloudflare {interface Env extends CloudflareEnvSecrets {}}
