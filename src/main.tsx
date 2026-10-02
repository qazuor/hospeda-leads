import {UnsavedNavigation} from './components/UnsavedChanges';
import SalePage from './pages/sale';
import ArchivedPage from './pages/archived';
import GuidePage from './pages/guide';
import LibraryPage from './pages/library';
import PasswordRecoveryPage from "./pages/password-recovery";
import ReactivationPage from "./pages/reactivation";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { GlobalContextProviders } from "./components/_globalContextProviders";
import { AdminRoute, UserRoute } from "./components/ProtectedRoute";
import MyDayPage from "./pages/my-day";
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

function OpportunityEntry(){
 const {search}=useLocation(),params=new URLSearchParams(search),id=params.get('leadId');
 if(id&&/^\d+$/.test(id)&&!params.has('edit')&&!params.has('delete'))return <Navigate to={'/sales/'+id+(params.has('contact')?'?contact='+params.get('contact'):'')} replace/>;
 return <LeadsPage key="opportunity"/>;
}
function HomeEntry(){
  const {search}=useLocation();
  const legacyLead=new URLSearchParams(search).has("leadId");
  // Keep existing bookmarks and deep links to leads/filters operational.
  return <Navigate to={legacyLead?"/opportunities"+search:search?"/accounts"+search:"/my-day"} replace/>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <GlobalContextProviders>
        <UnsavedNavigation/>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<PasswordRecoveryPage />} />
          <Route path="/reset-password" element={<PasswordRecoveryPage reset />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/" element={<UserRoute><HomeEntry /></UserRoute>} />
          <Route path="/sales/:leadId" element={<UserRoute><SalePage/></UserRoute>} />
          <Route path="/opportunities" element={<UserRoute><OpportunityEntry/></UserRoute>} />
          <Route path="/accounts" element={<UserRoute><LeadsPage key="business" businessMode /></UserRoute>} />
          <Route path="/accounts/:accountId" element={<UserRoute><AccountsPage /></UserRoute>} />
          <Route path="/my-day" element={<UserRoute><MyDayPage key="day"/></UserRoute>} />
          <Route path="/reactivation" element={<UserRoute><ReactivationPage/></UserRoute>} />
          <Route path="/agenda" element={<UserRoute><MyDayPage key="agenda" agenda/></UserRoute>} />
          <Route path="/analytics" element={<AdminRoute><AnalyticsPage /></AdminRoute>} />
          <Route path="/history" element={<AdminRoute><HistoryPage /></AdminRoute>} />
          <Route path="/settings" element={<AdminRoute><SettingsPage /></AdminRoute>} />
          <Route path="/archived" element={<UserRoute><ArchivedPage/></UserRoute>} />
          <Route path="/guide" element={<UserRoute><GuidePage/></UserRoute>} />
          <Route path="/library" element={<UserRoute><LibraryPage/></UserRoute>} />
          <Route path="/templates" element={<AdminRoute><TemplatesPage /></AdminRoute>} />
          <Route path="/trash" element={<AdminRoute><TrashPage /></AdminRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </GlobalContextProviders>
    </BrowserRouter>
  </React.StrictMode>,
);
