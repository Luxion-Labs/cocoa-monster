import { Buffer } from "buffer";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { WalletProvider } from "./hooks/useWallet";
import { ensureNetwork } from "./lib/network";
import "./styles.css";

// Polyfills used by Midnight client libs in the browser.
globalThis.Buffer = Buffer;
// @ts-expect-error - third-party libs occasionally read process.env.NODE_ENV.
globalThis.process = { env: { NODE_ENV: import.meta.env.MODE } };

ensureNetwork();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <WalletProvider>
        <App />
      </WalletProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
