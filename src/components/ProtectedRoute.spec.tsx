import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { vi } from "vitest";
import { UserRoute } from "./ProtectedRoute";

vi.mock("../helpers/useAuth", () => ({ useAuth: () => ({ authState: { type: "unauthenticated" } }) }));

function Where() { const l = useLocation(); return <span data-testid="where">{l.pathname + l.search}</span>; }

function renderAt(entry: string) {
  return render(<MemoryRouter initialEntries={[entry]}><Routes><Route path="/login" element={<Where />} /><Route path="*" element={<UserRoute><div>secret</div></UserRoute>} /></Routes></MemoryRouter>);
}

describe("ProtectedRoute", () => {
  it("redirects to /login carrying the requested location as next", () => {
    renderAt("/accounts/2162?tab=comunicacion");
    expect(screen.getByTestId("where").textContent).toBe("/login?next=" + encodeURIComponent("/accounts/2162?tab=comunicacion"));
  });
  it("redirects to plain /login from the root", () => {
    renderAt("/");
    expect(screen.getByTestId("where").textContent).toBe("/login");
  });
});
