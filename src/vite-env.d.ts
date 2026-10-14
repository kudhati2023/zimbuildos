/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * zhms-api base URL. Defaults: `http://localhost:5000/api/v1` in development, `/api/v1` (same origin, behind
   * nginx) in a production web build. Set it for desktop (Tauri) builds, e.g. https://api.zimbuild.co.zw/api/v1.
   */
  readonly VITE_API_BASE?: string;
  /** Prototype ERP (server.py) base URL — development only; the prototype is not published in production. */
  readonly VITE_ERP_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
