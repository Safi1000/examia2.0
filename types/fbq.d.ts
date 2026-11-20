/** The queue stub the Meta pixel snippet installs on `window`. */
declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    /** True while the visitor is inside the portal: the Meta pixel must not load or count there (components/MetaPixel.tsx). */
    __htPortal?: boolean;
  }
}

export {};
