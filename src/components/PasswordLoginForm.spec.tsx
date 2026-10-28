import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { vi } from "vitest";
import { PasswordLoginForm } from "./PasswordLoginForm";

const postLogin = vi.hoisted(() => vi.fn());
vi.mock("../endpoints/auth/login_with_password_POST.schema", async importOriginal => ({ ...(await importOriginal<object>()), postLogin }));
vi.mock("../helpers/useAuth", () => ({ useAuth: () => ({ onLogin: vi.fn() }) }));

function Where() { const l = useLocation(); return <span data-testid="where">{l.pathname + l.search}</span>; }

async function loginAt(entry: string) {
  render(<MantineProvider><MemoryRouter initialEntries={[entry]}><Routes><Route path="/login" element={<PasswordLoginForm />} /><Route path="*" element={<Where />} /></Routes></MemoryRouter></MantineProvider>);
  fireEvent.change(screen.getByPlaceholderText("tu@email.com"), { target: { value: "a@b.co" } });
  fireEvent.change(screen.getByPlaceholderText("••••••••"), { target: { value: "password123" } });
  fireEvent.click(screen.getByRole("button", { name: /Ingresar/ }));
  return waitFor(() => expect(screen.getByTestId("where")).toBeTruthy());
}

describe("PasswordLoginForm return url", () => {
  beforeEach(() => { window.matchMedia = vi.fn().mockImplementation((query: string) => ({ matches: false, media: query, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })); postLogin.mockResolvedValue({ user: { id: 1 } }); });
  afterEach(() => { vi.clearAllMocks(); });

  it("navigates to a safe next path after login", async () => {
    await loginAt("/login?next=" + encodeURIComponent("/accounts/2162?tab=comunicacion"));
    expect(screen.getByTestId("where").textContent).toBe("/accounts/2162?tab=comunicacion");
  });
  it("falls back to / when next is unsafe", async () => {
    await loginAt("/login?next=" + encodeURIComponent("//evil.com"));
    expect(screen.getByTestId("where").textContent).toBe("/");
  });
  it("falls back to / when there is no next", async () => {
    await loginAt("/login");
    expect(screen.getByTestId("where").textContent).toBe("/");
  });
});
