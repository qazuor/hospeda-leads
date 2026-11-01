interface GMRequestOptions {
  method: string;
  url: string;
  headers?: Record<string, string>;
  data?: string;
  timeout?: number;
  responseType?: "json" | "arraybuffer";
  onload: (response: { status: number; response: unknown; responseText: string; responseHeaders?: string }) => void;
  onerror: () => void;
  ontimeout: () => void;
  onprogress?: (response: { loaded: number; total: number; lengthComputable: boolean }) => void;
}
declare function GM_xmlhttpRequest(options: GMRequestOptions): { abort(): void };
declare function GM_getValue<T>(key: string, fallback?: T): T;
declare function GM_setValue<T>(key: string, value: T): void;
declare function GM_registerMenuCommand(name: string, callback: () => void): void;

declare const unsafeWindow: Window & typeof globalThis;
