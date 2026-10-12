/** The queue stub the Meta pixel snippet installs on `window`. */
declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

export {};
