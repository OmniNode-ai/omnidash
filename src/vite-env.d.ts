/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set to '1' only by vite.config.ts when the dev server proxies the overlay projection URL (OMN-19994). */
  readonly OMNIDASH_SAME_ORIGIN_PROJECTION?: string;
}
