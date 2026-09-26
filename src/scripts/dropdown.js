const boundPointerDownRoots = new WeakSet();

function closeDropdown(details) {
  details.removeAttribute("open");
}

function onDropdownFocusOut(event) {
  const details = event.currentTarget;
  if (!details.open)
    return;

  const next = event.relatedTarget;
  if (next && details.contains(next))
    return;

  window.setTimeout(() => {
    if (!details.open)
      return;
    if (!details.contains(document.activeElement))
      closeDropdown(details);
  }, 0);
}

function onDropdownKeyDown(event) {
  if (event.key !== "Escape")
    return;

  const details = event.currentTarget;
  if (!details.open)
    return;

  event.preventDefault();
  closeDropdown(details);
}

function onMainPointerDown(event) {
  const main = event.currentTarget;

  for (const details of main.querySelectorAll(".dropdown[open]")) {
    if (!details.contains(event.target))
      closeDropdown(details);
  }
}

function bindMainPointerDown(root) {
  const main =
    root.querySelector?.("main") ??
    (root instanceof Element && root.matches("main") ? root : null);
  if (!main || boundPointerDownRoots.has(main))
    return;

  boundPointerDownRoots.add(main);
  main.addEventListener("pointerdown", onMainPointerDown);
}

export function initializeDropdowns(root = document) {
  for (const details of root.querySelectorAll(".dropdown")) {
    details.addEventListener("focusout", onDropdownFocusOut);
    details.addEventListener("keydown", onDropdownKeyDown);
  }

  bindMainPointerDown(root);
}
