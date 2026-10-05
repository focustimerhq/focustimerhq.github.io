const ZOOM_EASING = "cubic-bezier(0.2, 0.8, 0.2, 1)";
const ZOOM_DURATION = 500;
const DRAG_THRESHOLD = 5;
const SWIPE_THRESHOLD = 48;
const ZOOM_CURTAIN_PROP = "--zoom-curtain-t";

let zoomCurtainTRegistered = false;
if (typeof CSS !== "undefined" && "registerProperty" in CSS) {
  try {
    CSS.registerProperty({
      name: ZOOM_CURTAIN_PROP,
      syntax: "<number>",
      inherits: false,
      initialValue: "1",
    });
  } catch {
    // Already registered from a previous init.
  }
  zoomCurtainTRegistered = true;
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function parseCrop(raw) {
  if (!raw)
    return null;
  const parts = raw.split(/\s+/).map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN))
    return null;
  return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
}

function thumbVisibleRect(figure) {
  const crop = figure.querySelector(".screenshot-crop");
  return (crop ?? figure.querySelector(".screenshot-btn")).getBoundingClientRect();
}

function flipKeyframes(from, to, crop, naturalWidth, naturalHeight) {
  let cropLeft = 0;
  let cropTop = 0;
  let cropWidth = to.width;
  let cropHeight = to.height;

  if (crop && naturalWidth > 0 && naturalHeight > 0) {
    cropLeft = to.width * (crop.x / naturalWidth);
    cropTop = to.height * (crop.y / naturalHeight);
    cropWidth = to.width * (crop.width / naturalWidth);
    cropHeight = to.height * (crop.height / naturalHeight);
  }

  const sx = from.width / cropWidth;
  const sy = from.height / cropHeight;
  const dx = from.left - to.left - cropLeft * sx;
  const dy = from.top - to.top - cropTop * sy;
  return {
    from: {
      transform: `translate3d(${dx}px, ${dy}px, 0) scale(${sx}, ${sy})`,
    },
    to: {
      transform: "none",
    },
  };
}

// Both keyframes use the same 4-length inset so the clip interpolates on the
// compositor instead of repainting the screenshot every frame.
function cropInset(crop, rect, naturalWidth, naturalHeight) {
  const top = rect.height * (crop.y / naturalHeight);
  const left = rect.width * (crop.x / naturalWidth);
  const right = rect.width - left - rect.width * (crop.width / naturalWidth);
  const bottom = rect.height - top - rect.height * (crop.height / naturalHeight);
  return `inset(${top}px ${right}px ${bottom}px ${left}px)`;
}

function getThumbImage(figure) {
  return figure.querySelector(".screenshot-btn img");
}

function figureHasDesktopBackground(figure) {
  return figure.hasAttribute("data-background");
}

function syncBackgroundClass(img, figure) {
  if (img)
    img.classList.toggle("background", figureHasDesktopBackground(figure));
}

function figureImageSrc(figure) {
  const thumbImg = getThumbImage(figure);
  return thumbImg.getAttribute("src") || thumbImg.src;
}

function loadImageElement(img) {
  return new Promise((resolve, reject) => {
    if (img.complete) {
      if (img.naturalWidth > 0)
        resolve(img);
      else
        reject(new Error("Image failed to load"));
      return;
    }
    img.addEventListener("load", () => resolve(img), { once: true });
    img.addEventListener("error", () => reject(new Error("Image failed to load")), { once: true });
  });
}

function applyLightboxImageTo(lightboxImg, figure) {
  lightboxImg.src = figureImageSrc(figure);
  lightboxImg.removeAttribute("srcset");
  lightboxImg.removeAttribute("sizes");
  lightboxImg.removeAttribute("width");
  lightboxImg.removeAttribute("height");
}

function lightboxSlideImage(slide) {
  return slide.querySelector(".lightbox-img");
}

function lightboxSlideCaption(slide) {
  return slide.querySelector(".lightbox-caption");
}

function commitLightboxSlide(figure, slide) {
  const lightboxImg = lightboxSlideImage(slide);
  const captionEl = lightboxSlideCaption(slide);
  applyLightboxImageTo(lightboxImg, figure);
  lightboxImg.alt = figure.dataset.alt || figure.dataset.caption || "";
  syncBackgroundClass(lightboxImg, figure);
  captionEl.textContent = figure.dataset.caption || "";
}

async function ensureLightboxImageReady(img) {
  if (!img.complete || img.naturalWidth === 0)
    await loadImageElement(img);
  try {
    await img.decode();
  } catch {
    // Show swapped content even if decode is unsupported or fails.
  }
}

const BACKDROP_FADE_MS = 300;

function curtainWidthPx(carousel) {
  const raw = getComputedStyle(carousel).getPropertyValue("--carousel-curtain-width");
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : 60;
}

function hostPercent(viewportX, hostRect) {
  return `${((viewportX - hostRect.left) / hostRect.width) * 100}%`;
}

function buildThumbCurtainMask(thumbRect, carousel, hostRect) {
  if (!thumbRect.width || !hostRect.width)
    return null;

  const leftActive = carousel.hasAttribute("data-more-start");
  const rightActive = carousel.hasAttribute("data-more-end");
  if (!leftActive && !rightActive)
    return null;

  const carouselRect = carousel.getBoundingClientRect();
  const curtain = curtainWidthPx(carousel);
  const leftInner = carouselRect.left + curtain;
  const rightInner = carouselRect.right - curtain;
  const leftOverlaps = leftActive
    && thumbRect.left < leftInner
    && thumbRect.right > carouselRect.left;
  const rightOverlaps = rightActive
    && thumbRect.right > rightInner
    && thumbRect.left < carouselRect.right;

  if (!leftOverlaps && !rightOverlaps)
    return null;

  const t = `var(${ZOOM_CURTAIN_PROP})`;
  const pct = (x) => hostPercent(x, hostRect);
  const stops = [];

  if (leftOverlaps) {
    stops.push(`rgba(0, 0, 0, ${t}) 0%`);
    stops.push(`rgba(0, 0, 0, ${t}) ${pct(carouselRect.left)}`);
    stops.push(`black ${pct(leftInner)}`);
  } else {
    stops.push("black 0%");
  }

  if (rightOverlaps) {
    stops.push(`black ${pct(rightInner)}`);
    stops.push(`rgba(0, 0, 0, ${t}) ${pct(carouselRect.right)}`);
    stops.push(`rgba(0, 0, 0, ${t}) 100%`);
  } else {
    stops.push("black 100%");
  }

  return `linear-gradient(to right, ${stops.join(", ")})`;
}

function waitBackdropFade() {
  return new Promise((resolve) => {
    window.setTimeout(resolve, BACKDROP_FADE_MS);
  });
}

export function initializeScreenshots(root = document) {
  const section = root.querySelector("#screenshots");
  if (!section)
    return;

  const carousel = section.querySelector(".carousel");
  const scroller = section.querySelector(".carousel-inner");
  const sentinelStart = section.querySelector(".carousel-sentinel-start");
  const sentinelEnd = section.querySelector(".carousel-sentinel-end");
  const dialog = section.querySelector("dialog.lightbox");
  const lightboxSlides = dialog ? [...dialog.querySelectorAll(".lightbox-slide")] : [];
  const closeBtn = dialog?.querySelector(".lightbox-close");
  const prevBtn = dialog?.querySelector(".lightbox-previous");
  const nextBtn = dialog?.querySelector(".lightbox-next");

  if (!carousel || !scroller || !dialog || !closeBtn || !prevBtn || !nextBtn || lightboxSlides.length < 2)
    return;

  let activeLightboxLayer = lightboxSlides.findIndex((slide) => slide.classList.contains("is-active"));
  if (activeLightboxLayer < 0)
    activeLightboxLayer = 0;
  let lightboxImg = lightboxSlideImage(lightboxSlides[activeLightboxLayer]);
  let captionEl = lightboxSlideCaption(lightboxSlides[activeLightboxLayer]);

  const figures = [...section.querySelectorAll(".screenshot")];
  let activeIndex = 0;
  let restoreFocus = null;
  let animating = false;
  let lightboxContentGeneration = 0;
  let swipePointerId = null;

  function inactiveLightboxLayer() {
    return 1 - activeLightboxLayer;
  }

  function setActiveLightboxLayer(index) {
    activeLightboxLayer = index;
    lightboxSlides.forEach((slide, layerIndex) => {
      const active = layerIndex === index;
      slide.classList.toggle("is-active", active);
      slide.toggleAttribute("aria-hidden", !active);
    });
    lightboxImg = lightboxSlideImage(lightboxSlides[index]);
    captionEl = lightboxSlideCaption(lightboxSlides[index]);
  }

  setActiveLightboxLayer(activeLightboxLayer);

  async function swapLightboxFigure(figure, isStale) {
    const nextIndex = inactiveLightboxLayer();
    const nextSlide = lightboxSlides[nextIndex];

    commitLightboxSlide(figure, nextSlide);
    await ensureLightboxImageReady(lightboxSlideImage(nextSlide));
    if (isStale())
      return false;

    void nextSlide.offsetHeight;

    setActiveLightboxLayer(nextIndex);
    return !isStale();
  }

  function syncBlinders() {
    const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    const edgeSlop = 2;

    carousel.toggleAttribute("data-more-start", scroller.scrollLeft > edgeSlop);
    carousel.toggleAttribute(
      "data-more-end",
      maxScroll > edgeSlop && scroller.scrollLeft < maxScroll - edgeSlop,
    );
  }

  if (sentinelStart && sentinelEnd) {
    const blinderObserver = new IntersectionObserver(
      () => syncBlinders(),
      { root: scroller, threshold: [0, 1] },
    );
    blinderObserver.observe(sentinelStart);
    blinderObserver.observe(sentinelEnd);
  }

  window.addEventListener("resize", syncBlinders);
  syncBlinders();

  let dragPointerId = null;
  let dragStartX = 0;
  let dragStartScroll = 0;
  let dragLastX = 0;
  let dragging = false;
  let dragMoved = false;

  const SNAP_EDGE_REST = 12;

  function scrollMax() {
    return Math.max(0, scroller.scrollWidth - scroller.clientWidth);
  }

  function scrollToPoint(left, behavior) {
    const target = Math.min(scrollMax(), Math.max(0, left));
    if (Math.abs(target - scroller.scrollLeft) < 1) {
      syncBlinders();
      return Promise.resolve();
    }

    if (prefersReducedMotion() || behavior === "auto") {
      scroller.scrollLeft = target;
      syncBlinders();
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled)
          return;
        settled = true;
        scroller.removeEventListener("scrollend", onScrollEnd);
        window.clearTimeout(fallbackTimer);
        syncBlinders();
        resolve();
      };
      const onScrollEnd = () => finish();
      const fallbackTimer = window.setTimeout(finish, 450);

      scroller.addEventListener("scrollend", onScrollEnd, { once: true });
      scroller.scrollTo({ left: target, behavior: "smooth" });
    });
  }

  function snapToEdgeIfNeeded() {
    const maxScroll = scrollMax();
    const current = scroller.scrollLeft;

    if (current <= SNAP_EDGE_REST)
      return scrollToPoint(0);

    if (maxScroll > SNAP_EDGE_REST && current >= maxScroll - SNAP_EDGE_REST)
      return scrollToPoint(maxScroll);

    syncBlinders();
    return Promise.resolve();
  }

  function endDrag(event) {
    if (dragPointerId === null)
      return;
    if (event?.pointerId !== undefined && event.pointerId !== dragPointerId)
      return;

    const wasDragging = dragging;
    const wasDrag = dragMoved;
    const pointerId = dragPointerId;

    dragPointerId = null;
    dragging = false;
    dragMoved = false;

    if (wasDragging) {
      try {
        scroller.releasePointerCapture(pointerId);
      } catch {
        // Already released.
      }

      void snapToEdgeIfNeeded().finally(() => {
        scroller.classList.remove("is-dragging");
        syncBlinders();
      });
    }

    if (wasDrag) {
      scroller.addEventListener(
        "click",
        (clickEvent) => {
          clickEvent.preventDefault();
          clickEvent.stopPropagation();
        },
        { capture: true, once: true },
      );
    }
  }

  scroller.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "mouse" || event.button !== 0)
      return;
    dragPointerId = event.pointerId;
    dragStartX = event.clientX;
    dragStartScroll = scroller.scrollLeft;
    dragLastX = event.clientX;
    dragging = false;
    dragMoved = false;
  });

  scroller.addEventListener("pointermove", (event) => {
    if (dragPointerId === null || event.pointerId !== dragPointerId)
      return;

    const dx = event.clientX - dragStartX;
    if (!dragging && Math.abs(dx) <= DRAG_THRESHOLD)
      return;

    if (!dragging) {
      dragging = true;
      dragMoved = true;
      scroller.classList.add("is-dragging");
      scroller.setPointerCapture(event.pointerId);
      scroller.scrollLeft = dragStartScroll - dx;
      dragLastX = event.clientX;
      return;
    }

    const delta = event.clientX - dragLastX;
    dragLastX = event.clientX;
    scroller.scrollLeft -= delta;
  });

  scroller.addEventListener("pointerup", endDrag);
  scroller.addEventListener("pointercancel", endDrag);
  scroller.addEventListener("lostpointercapture", endDrag);

  function updateNavButtons() {
    prevBtn?.setAttribute("aria-disabled", activeIndex <= 0 ? "true" : "false");
    nextBtn?.setAttribute("aria-disabled", activeIndex >= figures.length - 1 ? "true" : "false");
  }

  async function setLightboxContent(index, { preload = true } = {}) {
    const generation = ++lightboxContentGeneration;
    const figure = figures[index];
    const isStale = () => generation !== lightboxContentGeneration;

    if (preload) {
      const swapped = await swapLightboxFigure(figure, isStale);
      if (!swapped)
        return false;
    } else {
      commitLightboxSlide(figure, lightboxSlides[activeLightboxLayer]);
      lightboxImg = lightboxSlideImage(lightboxSlides[activeLightboxLayer]);
      captionEl = lightboxSlideCaption(lightboxSlides[activeLightboxLayer]);
    }

    activeIndex = index;
    updateNavButtons();
    return true;
  }

  async function warmImage(button) {
    const img = button.querySelector("img");
    if (!img || img.complete)
      return;
    try {
      await img.decode();
    } catch {
      // Ignore decode errors.
    }
  }

  let curtainFadeFrame = null;
  let curtainFadeAnimation = null;

  function stopCurtainFade() {
    if (curtainFadeFrame !== null) {
      cancelAnimationFrame(curtainFadeFrame);
      curtainFadeFrame = null;
    }
    if (curtainFadeAnimation) {
      curtainFadeAnimation.cancel();
      curtainFadeAnimation = null;
    }
  }

  function clearZoomCurtainMask() {
    stopCurtainFade();
    dialog.style.removeProperty(ZOOM_CURTAIN_PROP);
    dialog.style.removeProperty("mask-image");
    dialog.style.removeProperty("-webkit-mask-image");
  }

  function applyThumbCurtainMask(thumbRect, fade) {
    const mask = buildThumbCurtainMask(thumbRect, carousel, dialog.getBoundingClientRect());
    if (!mask) {
      clearZoomCurtainMask();
      return false;
    }

    dialog.style.setProperty(ZOOM_CURTAIN_PROP, String(fade));
    dialog.style.webkitMaskImage = mask;
    dialog.style.maskImage = mask;
    return true;
  }

  function followCurtainFade(animation, curtainFade) {
    const tick = () => {
      const progress = animation.effect.getComputedTiming().progress;
      const t = progress == null
        ? curtainFade.to
        : curtainFade.from + (curtainFade.to - curtainFade.from) * progress;
      dialog.style.setProperty(ZOOM_CURTAIN_PROP, String(t));
      if (animation.playState === "running")
        curtainFadeFrame = requestAnimationFrame(tick);
      else
        curtainFadeFrame = null;
    };
    tick();
  }

  function startCurtainFade(animation, curtainFade, options) {
    stopCurtainFade();
    if (!curtainFade)
      return;

    if (zoomCurtainTRegistered) {
      curtainFadeAnimation = dialog.animate(
        [
          { [ZOOM_CURTAIN_PROP]: curtainFade.from },
          { [ZOOM_CURTAIN_PROP]: curtainFade.to },
        ],
        options,
      );
    } else {
      followCurtainFade(animation, curtainFade);
    }
  }

  async function animateZoom(keyframes, options, curtainFade) {
    const animation = lightboxImg.animate(keyframes, options);
    startCurtainFade(animation, curtainFade, options);

    try {
      await animation.finished;
    } catch {
      // Cancelled.
    } finally {
      stopCurtainFade();
    }
  }

  function zoomFrames(fromTransform, toTransform, fromClip, toClip) {
    const fromFrame = { transform: fromTransform };
    const toFrame = { transform: toTransform };
    if (fromClip !== toClip) {
      fromFrame.clipPath = fromClip;
      toFrame.clipPath = toClip;
    }
    return [fromFrame, toFrame];
  }

  function cancelLightboxAnimations() {
    dialog.querySelectorAll(".lightbox-img").forEach((img) => {
      img.getAnimations().forEach((animation) => animation.cancel());
      img.style.transform = "";
      img.style.clipPath = "";
      img.classList.remove("is-crop-zoom");
    });
  }

  function scrollFigureIntoView(figure) {
    if (!figure)
      return;

    const thumb = thumbVisibleRect(figure);
    const view = scroller.getBoundingClientRect();
    let delta = 0;

    if (thumb.left < view.left)
      delta = thumb.left - view.left;
    else if (thumb.right > view.right)
      delta = thumb.right - view.right;

    if (Math.abs(delta) < 1)
      return;

    void scrollToPoint(scroller.scrollLeft + delta, "auto");
  }

  async function animateOpen(figure) {
    const crop = parseCrop(figure.dataset.crop);
    const fromRect = thumbVisibleRect(figure);

    dialog.classList.add("is-zooming");
    const toRect = lightboxImg.getBoundingClientRect();
    const hasCurtainMask = applyThumbCurtainMask(fromRect, 0);
    const curtainFade = hasCurtainMask ? { from: 0, to: 1 } : null;
    const cropped = crop && lightboxImg.naturalWidth > 0;
    const { from, to } = flipKeyframes(
      fromRect,
      toRect,
      cropped ? crop : null,
      lightboxImg.naturalWidth,
      lightboxImg.naturalHeight,
    );
    const openClip = "inset(0px 0px 0px 0px)";
    const fromClip = cropped
      ? cropInset(crop, toRect, lightboxImg.naturalWidth, lightboxImg.naturalHeight)
      : openClip;

    if (cropped) {
      lightboxImg.classList.add("is-crop-zoom");
      lightboxImg.style.clipPath = fromClip;
    }
    lightboxImg.style.transform = from.transform;
    if (cropped)
      void lightboxImg.offsetWidth;
    dialog.classList.remove("is-opening");
    figure.classList.add("is-thumb-hidden");

    try {
      await animateZoom(
        zoomFrames(from.transform, to.transform, fromClip, openClip),
        { duration: ZOOM_DURATION, easing: ZOOM_EASING, fill: "forwards" },
        curtainFade,
      );
    } catch {
      // Cancelled.
    }

    dialog.classList.remove("is-zooming");
    clearZoomCurtainMask();
    cancelLightboxAnimations();
  }

  async function animateClose(figure) {
    if (!figure) {
      cancelLightboxAnimations();
      return;
    }

    const crop = parseCrop(figure.dataset.crop);
    const thumbRect = thumbVisibleRect(figure);
    dialog.classList.add("is-zooming");
    const fromRect = lightboxImg.getBoundingClientRect();
    const hasCurtainMask = applyThumbCurtainMask(thumbRect, 1);
    const curtainFade = hasCurtainMask ? { from: 1, to: 0 } : null;
    const cropped = crop && lightboxImg.naturalWidth > 0;
    const { from } = flipKeyframes(
      thumbRect,
      fromRect,
      cropped ? crop : null,
      lightboxImg.naturalWidth,
      lightboxImg.naturalHeight,
    );
    const openClip = "inset(0px 0px 0px 0px)";
    const toClip = cropped
      ? cropInset(crop, fromRect, lightboxImg.naturalWidth, lightboxImg.naturalHeight)
      : openClip;

    if (cropped) {
      lightboxImg.classList.add("is-crop-zoom");
      void lightboxImg.offsetWidth;
    }

    try {
      await animateZoom(
        zoomFrames("none", from.transform, openClip, toClip),
        { duration: ZOOM_DURATION, easing: ZOOM_EASING, fill: "forwards" },
        curtainFade,
      );
    } catch {
      // Cancelled.
    }

    figure.classList.remove("is-thumb-hidden");
  }

  async function openLightbox(index, button) {
    if (animating || dialog.open)
      return;

    animating = true;
    restoreFocus = button;
    const figure = figures[index];

    try {
      await setLightboxContent(index, { preload: false });

      dialog.classList.remove("is-closing");
      dialog.classList.add("is-opening");

      try {
        await lightboxImg.decode();
      } catch {
        // Ignore decode errors.
      }

      dialog.showModal();

      if (prefersReducedMotion()) {
        dialog.classList.remove("is-opening");
        figure.classList.add("is-thumb-hidden");
        closeBtn.focus();
        return;
      }

      try {
        await animateOpen(figure);
      } finally {
        dialog.classList.remove("is-opening", "is-zooming");
      }
      closeBtn.focus();
    } finally {
      animating = false;
    }
  }

  async function closeLightbox() {
    if (!dialog.open || animating)
      return;

    animating = true;
    swipePointerId = null;
    const figure = figures[activeIndex];
    const focusTarget = restoreFocus;

    if (prefersReducedMotion()) {
      figure?.classList.remove("is-thumb-hidden");
      dialog.close();
      animating = false;
      focusTarget?.focus();
      return;
    }

    dialog.classList.add("is-zooming", "is-closing");
    await Promise.all([animateClose(figure), waitBackdropFade()]);

    dialog.classList.remove("is-closing", "is-zooming");
    dialog.close();
    clearZoomCurtainMask();
    cancelLightboxAnimations();
    animating = false;
    focusTarget?.focus();
  }

  async function goToSlide(index) {
    if (!dialog.open || index < 0 || index >= figures.length || index === activeIndex || animating)
      return;

    animating = true;
    try {
      const committed = await setLightboxContent(index);
      if (committed) {
        figures.forEach((figure, figureIndex) => {
          figure.classList.toggle("is-thumb-hidden", figureIndex === index);
        });
        scrollFigureIntoView(figures[index]);
      }
    } finally {
      animating = false;
    }
  }

  figures.forEach((figure, index) => {
    syncBackgroundClass(getThumbImage(figure), figure);
    const button = figure.querySelector(".screenshot-btn");
    button.addEventListener("pointerenter", () => warmImage(button));
    button.addEventListener("focus", () => warmImage(button));
    button.addEventListener("click", () => openLightbox(index, button));
  });

  closeBtn.addEventListener("click", () => closeLightbox());
  prevBtn?.addEventListener("click", () => goToSlide(activeIndex - 1));
  nextBtn?.addEventListener("click", () => goToSlide(activeIndex + 1));

  let swipeStartX = 0;
  let swipeStartY = 0;

  function isLightboxControlTarget(target) {
    return target instanceof Element && Boolean(target.closest("button, a"));
  }

  function resetLightboxSwipe(pointerId) {
    if (swipePointerId === null || swipePointerId !== pointerId)
      return;
    swipePointerId = null;
  }

  function finishLightboxSwipe(event) {
    if (swipePointerId === null || event.pointerId !== swipePointerId)
      return;

    const dx = event.clientX - swipeStartX;
    const dy = event.clientY - swipeStartY;
    const pointerId = swipePointerId;

    swipePointerId = null;

    try {
      dialog.releasePointerCapture(pointerId);
    } catch {
      // Already released.
    }

    if (!dialog.open)
      return;

    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy))
      return;

    if (dx < 0)
      goToSlide(activeIndex + 1);
    else
      goToSlide(activeIndex - 1);
  }

  dialog.addEventListener("pointerdown", (event) => {
    if (!dialog.open)
      return;
    if (event.pointerType === "mouse" && event.button !== 0)
      return;
    if (isLightboxControlTarget(event.target))
      return;

    swipePointerId = event.pointerId;
    swipeStartX = event.clientX;
    swipeStartY = event.clientY;
  });

  dialog.addEventListener("pointermove", (event) => {
    if (swipePointerId === null || event.pointerId !== swipePointerId)
      return;

    const dx = event.clientX - swipeStartX;
    const dy = event.clientY - swipeStartY;
    if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD)
      return;
    if (Math.abs(dx) < Math.abs(dy))
      return;

    try {
      dialog.setPointerCapture(event.pointerId);
    } catch {
      // Ignore.
    }
  });

  dialog.addEventListener("pointerup", finishLightboxSwipe);
  dialog.addEventListener("pointercancel", (event) => resetLightboxSwipe(event.pointerId));

  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeLightbox();
  });

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog)
      closeLightbox();
  });

  dialog.addEventListener("keydown", (event) => {
    if (!dialog.open)
      return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goToSlide(activeIndex - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      goToSlide(activeIndex + 1);
    }
  });

  updateNavButtons();
}


initializeScreenshots();