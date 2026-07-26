/**
 * Vite + React entry for `@starter/web`.
 * Global styles pull in Tailwind layers (`styles.css`).
 */

import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { AuthProvider } from "./auth/AuthContext.js";
import { ToastProvider } from "./components/ToastProvider.js";
import { RootDocumentHead } from "./document/RootDocumentHead.js";
import "./styles.css";
import { App } from "./App.js";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RootDocumentHead />
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
