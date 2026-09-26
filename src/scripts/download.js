const DESKTOP = "(min-width: 768px)";
const HIDE_DELAY_MS = 300;

function initializeDownloadSection(root = document) {
  const grid = root.querySelector("#download .download-grid");
  const left = grid?.querySelector(".column:nth-child(1)");
  const right = grid?.querySelector(".column:nth-child(2)");
  const flatpak = grid?.querySelector(".download-flatpak");
  const repos = grid?.querySelector(".download-repos");

  if (!grid || !left || !right || !repos || !flatpak) {
    console.error("Download grid elements not found");
    return;
  }

  const desktop = window.matchMedia(DESKTOP);
  let overLeft = false;
  let overRight = false;
  let hideTimer;

  function syncInert() {
    const alt = grid.classList.contains("is-alt");
    repos.toggleAttribute("inert", desktop.matches && alt);
    flatpak.toggleAttribute("inert", desktop.matches && !alt);
  }

  function show() {
    clearTimeout(hideTimer);
    grid.classList.add("is-alt");
    syncInert();
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      grid.classList.remove("is-alt");
      syncInert();
    }, HIDE_DELAY_MS);
  }

  function update() {
    if (!desktop.matches) {
      clearTimeout(hideTimer);
      grid.classList.remove("is-alt");
      repos.removeAttribute("inert");
      flatpak.removeAttribute("inert");
      return;
    }

    if (overLeft) {
      show();
      return;
    }

    if (overRight && grid.classList.contains("is-alt")) {
      clearTimeout(hideTimer);
      return;
    }

    scheduleHide();
  }

  left.addEventListener("mouseenter", () => {
    overLeft = true;
    update();
  });
  left.addEventListener("mouseleave", () => {
    overLeft = false;
    update();
  });
  left.addEventListener("focusin", () => {
    overLeft = true;
    update();
  });
  left.addEventListener("focusout", (event) => {
    if (!left.contains(event.relatedTarget)) {
      overLeft = false;
      update();
    }
  });

  right.addEventListener("mouseenter", () => {
    overRight = true;
    update();
  });
  right.addEventListener("mouseleave", () => {
    overRight = false;
    update();
  });
  right.addEventListener("focusin", () => {
    overRight = true;
    update();
  });
  right.addEventListener("focusout", (event) => {
    if (!right.contains(event.relatedTarget)) {
      overRight = false;
      update();
    }
  });

  desktop.addEventListener("change", update);
  syncInert();
}

initializeDownloadSection();