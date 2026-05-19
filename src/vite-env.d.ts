/// <reference types="vite/client" />

import type { TempoApi } from "../electron/preload";

declare global {
  interface Window {
    tempo?: TempoApi;
  }
}
