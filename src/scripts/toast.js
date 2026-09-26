const RENAME_REFERER = "gnome-pomodoro";

function shouldShowRenameToast() {
  const params = new URLSearchParams(window.location.search);
  return params.get("referer") === RENAME_REFERER;
}

function stripRefererFromUrl() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("referer"))
    return;

  url.searchParams.delete("referer");
  const search = url.searchParams.toString();
  const next = `${url.pathname}${search ? `?${search}` : ""}${url.hash}`;
  history.replaceState(null, "", next);
}

function createRenameToast() {
  const overlay = document.createElement("div");
  overlay.className = "toast-overlay";
  overlay.setAttribute("data-nosnippet", "");

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");

  const title = document.createElement("p");
  title.className = "toast-title";
  const emphasis = document.createElement("b");
  emphasis.textContent = "GNOME Pomodoro";
  title.append(emphasis, " project has been renamed");

  const close = document.createElement("button");
  close.type = "button";
  close.className = "toast-close";
  close.setAttribute("aria-label", "Dismiss");

  const icon = document.createElement("span");
  icon.className = "icon icon-close";
  icon.setAttribute("aria-hidden", "true");
  close.append(icon);

  toast.append(title, close);
  overlay.append(toast);

  return overlay;
}

function dismissToast(overlay) {
  if (!overlay.classList.contains("is-visible"))
    return;

  overlay.classList.remove("is-visible");
  stripRefererFromUrl();

  const toast = overlay.querySelector(".toast");
  const hide = () => {
    overlay.remove();
  };

  if (!toast || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    hide();
    return;
  }

  toast.addEventListener("transitionend", hide, { once: true });
}

export function initializeToast() {
  if (!shouldShowRenameToast())
    return;

  const overlay = createRenameToast();
  document.body.insertBefore(overlay, document.body.firstChild);

  window.requestAnimationFrame(() => {
    overlay.classList.add("is-visible");
  });

  overlay.querySelector(".toast-close")?.addEventListener("click", () => {
    dismissToast(overlay);
  });
}
