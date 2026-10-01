import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { GlobalContextProviders } from "./components/_globalContextProviders";
import { AdminRoute, UserRoute } from "./components/ProtectedRoute";
import AccountsPage from "./pages/accounts";
import LeadsPage from "./pages/_index";
import AnalyticsPage from "./pages/analytics";
import HistoryPage from "./pages/history";
import LoginPage from "./pages/login";
import RegisterPage from "./pages/register";
import SettingsPage from "./pages/settings";
import TemplatesPage from "./pages/templates";
import TrashPage from "./pages/trash";
import "./base.css";

function HomeEntry(){
  const {search}=useLocation();
  const legacyLead=new URLSearchParams(search).has("leadId");
  // Keep existing bookmarks and deep links to leads/filters operational.
  return <Navigate to={legacyLead?"/opportunities"+search:"/accounts"+search} replace/>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <GlobalContextProviders>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/" element={<UserRoute><HomeEntry /></UserRoute>} />
          <Route path="/opportunities" element={<UserRoute><LeadsPage key="opportunity" /></UserRoute>} />
          <Route path="/accounts" element={<UserRoute><LeadsPage key="business" businessMode /></UserRoute>} />
          <Route path="/accounts/:accountId" element={<UserRoute><AccountsPage /></UserRoute>} />
          <Route path="/analytics" element={<AdminRoute><AnalyticsPage /></AdminRoute>} />
          <Route path="/history" element={<AdminRoute><HistoryPage /></AdminRoute>} />
          <Route path="/settings" element={<AdminRoute><SettingsPage /></AdminRoute>} />
          <Route path="/templates" element={<AdminRoute><TemplatesPage /></AdminRoute>} />
          <Route path="/trash" element={<AdminRoute><TrashPage /></AdminRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </GlobalContextProviders>
    </BrowserRouter>
  </React.StrictMode>,
);
