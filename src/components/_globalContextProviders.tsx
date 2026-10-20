import { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeModeProvider } from "../helpers/themeMode";
import { SonnerToaster } from "./SonnerToaster";
import { ScrollToHashElement } from "./ScrollToHashElement";
import { AuthProvider } from "../helpers/useAuth";
import { LiveModeProvider } from "../helpers/liveMode";
import { CrmThemeProvider } from './ui/CrmThemeProvider';
import { shouldRetryQuery } from "../helpers/apiClient";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute “fresh” window
      retry: shouldRetryQuery, // never repeat offline/400/401/403/404/409; at most 2 retries otherwise
    },
    mutations: { retry: false }, // uncertain sends are never repeated automatically
  },
});

export const GlobalContextProviders = ({
  children,
}: {
  children: ReactNode;
}) => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
      <ThemeModeProvider>
        <CrmThemeProvider>
        <LiveModeProvider>
        <ScrollToHashElement />
          {children}
          <SonnerToaster />
        </LiveModeProvider>
        </CrmThemeProvider>
      </ThemeModeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};
