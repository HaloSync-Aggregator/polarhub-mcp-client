/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BRIDGE_WS_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
