/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** zhms-api base URL, e.g. https://api.zimbuild.co.zw/api/v1 (defaults to http://localhost:5000/api/v1) */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
