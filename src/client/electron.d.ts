export {}; // make this a module

declare global {
  interface Window {
    kalamalahElectron: {
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      isMaximized: () => Promise<boolean>;
      onMaximized: (callback: (isMaximized: boolean) => void) => () => void;
      platform: string;
      version: string;
    };
    __KALAMALAH_SHOW_CHANGELOG__: () => void;
    __KALAMALAH_SET_GPU_ONLY__: (enabled: boolean) => void;
    __kalamalahZarazConsent?: Record<string, boolean>;
    __kalamalahZarazRetries?: number;
  }
}