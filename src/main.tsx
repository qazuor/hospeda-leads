import React from "react";
import {AppCommandPalette} from './components/AppCommandPalette';
import {UnsavedNavigation} from './components/UnsavedChanges';
const SalePage=React.lazy(()=>import('./pages/sale'));
const ArchivedPage=React.lazy(()=>import('./pages/archived'));
const GuidePage=React.lazy(()=>import('./pages/guide'));
const LibraryPage=React.lazy(()=>import('./pages/library'));
const PasswordRecoveryPage=React.lazy(()=>import("./pages/password-recovery"));
import {RouteLoading} from "./components/RouteLoading";
import {AppErrorBoundary} from "./components/AppErrorBoundary";
import {installPreloadErrorHandler} from "./helpers/chunkReload";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { GlobalContextProviders } from "./components/_globalContextProviders";
import { AdminRoute, UserRoute } from "./components/ProtectedRoute";
const MyDayPage=React.lazy(()=>import("./pages/my-day"));
const AccountsPage=React.lazy(()=>import("./pages/accounts"));
const BusinessListPage=React.lazy(()=>import("./pages/business-list"));
const LeadsPage=React.lazy(()=>import("./pages/_index"));
const AnalyticsPage=React.lazy(()=>import("./pages/analytics"));
const HistoryPage=React.lazy(()=>import("./pages/history"));
const LoginPage=React.lazy(()=>import("./pages/login"));
const RegisterPage=React.lazy(()=>import("./pages/register"));
const SettingsPage=React.lazy(()=>import("./pages/settings"));
const TemplatesPage=React.lazy(()=>import("./pages/templates"));
const TrashPage=React.lazy(()=>import("./pages/trash"));
const InboundPage=React.lazy(()=>import("./pages/inbound"));
import './styleLayers.css';
import '@mantine/core/styles.layer.css';
import '@mantine/spotlight/styles.layer.css';
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

function RouteBoundary({children}:{children:React.ReactNode}){
  const {pathname,search}=useLocation();
  // Hoy switches views through ?view, so a failed view must recover when the seller picks another tab.
  return <AppErrorBoundary resetKey={pathname+'?view='+(new URLSearchParams(search).get('view')??'')}>{children}</AppErrorBoundary>;
}

installPreloadErrorHandler();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <GlobalContextProviders>
        <UnsavedNavigation/>
        <AppCommandPalette/>
        <RouteBoundary>
        <React.Suspense fallback={<RouteLoading/>}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<PasswordRecoveryPage />} />
          <Route path="/reset-password" element={<PasswordRecoveryPage reset />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/" element={<UserRoute><HomeEntry /></UserRoute>} />
          <Route path="/sales/:leadId" element={<UserRoute><SalePage/></UserRoute>} />
          <Route path="/opportunities" element={<UserRoute><OpportunityEntry/></UserRoute>} />
          <Route path="/accounts" element={<UserRoute><BusinessListPage /></UserRoute>} />
          <Route path="/accounts/:accountId" element={<UserRoute><AccountsPage /></UserRoute>} />
          <Route path="/my-day" element={<UserRoute><MyDayPage/></UserRoute>} />
          {/* Agenda and Reactivación live inside Hoy (owner decision 5A); old bookmarks keep working. */}
          <Route path="/reactivation" element={<Navigate to="/my-day?view=retomar" replace />} />
          <Route path="/agenda" element={<Navigate to="/my-day?view=calendar" replace />} />
          <Route path="/analytics" element={<AdminRoute><AnalyticsPage /></AdminRoute>} />
          <Route path="/history" element={<AdminRoute><HistoryPage /></AdminRoute>} />
          <Route path="/settings" element={<AdminRoute><SettingsPage /></AdminRoute>} />
          <Route path="/archived" element={<AdminRoute><ArchivedPage/></AdminRoute>} />
          <Route path="/guide" element={<UserRoute><GuidePage/></UserRoute>} />
          <Route path="/library" element={<AdminRoute><LibraryPage/></AdminRoute>} />
          <Route path="/templates" element={<AdminRoute><TemplatesPage /></AdminRoute>} />
          <Route path="/trash" element={<AdminRoute><TrashPage /></AdminRoute>} />
          <Route path="/inbound" element={<AdminRoute><InboundPage /></AdminRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </React.Suspense>
        </RouteBoundary>
      </GlobalContextProviders>
    </BrowserRouter>
  </React.StrictMode>,
);
