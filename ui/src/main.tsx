import { Buffer } from "buffer";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Polyfills used by Midnight client libs in the browser.
globalThis.Buffer = Buffer;
// @ts-expect-error - third-party libs occasionally read process.env.NODE_ENV.
globalThis.process = { env: { NODE_ENV: import.meta.env.MODE } };

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
