export function registerSW(): void {
  if (!import.meta.env.PROD) return;
  if (!("serviceWorker" in navigator)) return;
  const hadController = Boolean(navigator.serviceWorker.controller);
  if (hadController) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    });
  }
  const register = () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      /* The page still works online if registration fails. */
    });
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register);
}
