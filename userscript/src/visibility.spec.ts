import { listenForVisibility } from "./visibility";

it("refreshes on return to a visible tab and unregisters cleanly", () => {
  const refresh = vi.fn(), stop = listenForVisibility(document, refresh);
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
  document.dispatchEvent(new Event("visibilitychange")); expect(refresh).not.toHaveBeenCalled();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  document.dispatchEvent(new Event("visibilitychange")); expect(refresh).toHaveBeenCalledOnce();
  stop(); document.dispatchEvent(new Event("visibilitychange")); expect(refresh).toHaveBeenCalledOnce();
});
