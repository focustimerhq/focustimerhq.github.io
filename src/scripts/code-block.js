function getCopyTarget(button) {
  const block = button.closest(".code-block");
  return (
    block?.querySelector("code") ??
    (button.dataset.copyTarget
      ? document.getElementById(button.dataset.copyTarget)
      : null)
  );
}

function showTooltip(button) {
  const previousLabel = button.getAttribute("aria-label");
  const tooltip = button.querySelector(".tooltip");

  button.setAttribute("aria-label", "Copied!");
  button.classList.add("is-copied");
  tooltip?.setAttribute("aria-visible", "true");

  window.setTimeout(() => {
    button.setAttribute("aria-label", previousLabel);
    button.classList.remove("is-copied");
    tooltip?.setAttribute("aria-visible", "false");
  }, 1500);
}

async function onCopyButtonClick(event) {
  const button = event.currentTarget;
  const target = getCopyTarget(button);

  if (!target || !navigator.clipboard?.writeText)
    return;

  try {
    await navigator.clipboard.writeText(target.textContent);
    showTooltip(button);
  } catch (error) {
    console.error(error);
  }
}

export function initializeCodeBlocks(root = document) {
  const pres = root.querySelectorAll("main pre");

  for (const pre of pres) {
    if (pre.closest(".code-block"))
      continue;

    const wrapper = document.createElement("div");
    wrapper.className = "code-block";

    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.append(pre);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "copy-button";
    button.setAttribute("aria-label", "Copy to clipboard");
    button.innerHTML =
      '<span class="tooltip tooltip-left" aria-hidden="true" aria-visible="false">Copied!</span>' +
      '<span class="icon icon-copy" aria-hidden="true"></span>';
    button.addEventListener("click", onCopyButtonClick);
    wrapper.append(button);
  }
}
