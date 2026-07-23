import { deduplicar } from "./index.js";

self.onmessage = event => {
  try {
    const { entradas, opts } = event.data;
    self.postMessage({ ok: true, result: deduplicar(entradas, opts) });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error && error.message ? error.message : String(error),
    });
  }
};
