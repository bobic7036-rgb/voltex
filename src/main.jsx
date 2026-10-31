import React from "react";
import {createRoot} from "react-dom/client";
import {TonConnectUIProvider} from "@tonconnect/ui-react";
import App from "./App.jsx";
import "./style.css";
createRoot(document.getElementById("root")).render(<TonConnectUIProvider manifestUrl={`${location.origin}/tonconnect-manifest.json`}><App/></TonConnectUIProvider>);