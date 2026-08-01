/* ==================================================================
   FADDEN AI — LANDING PAGE SCRIPT
   Handles: loading screen, mobile nav toggle, navbar scroll state,
   smooth scroll for in-page links, scroll-reveal animations,
   dynamic footer year.
   No frameworks, no external dependencies.
   ================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  /* ----------------------------------------------------------------
     1. LOADING SCREEN
     Hide once the page (including fonts/images) has fully loaded.
     A minimum display time avoids an awkward "flash" on fast
     connections while still feeling responsive on slow ones.
     ---------------------------------------------------------------- */
  const loadingScreen = document.getElementById('loading-screen');
  const MIN_LOADER_MS = 500;
  const loaderStart = Date.now();

  function hideLoader() {
    const elapsed = Date.now() - loaderStart;
    const remaining = Math.max(MIN_LOADER_MS - elapsed, 0);
    setTimeout(() => {
      if (loadingScreen) {
        loadingScreen.classList.add('is-hidden');
      }
    }, remaining);
  }

  if (document.readyState === 'complete') {
    hideLoader();
  } else {
    window.addEventListener('load', hideLoader);
  }

  /* ----------------------------------------------------------------
     2. NAVBAR — SCROLLED STATE
     Adds a background/blur to the navbar once the user scrolls
     past the top of the page, so it stays legible over content.
     ---------------------------------------------------------------- */
  const navbar = document.getElementById('navbar');
  const SCROLL_THRESHOLD = 24;

  function updateNavbarState() {
    if (!navbar) return;
    if (window.scrollY > SCROLL_THRESHOLD) {
      navbar.classList.add('is-scrolled');
    } else {
      navbar.classList.remove('is-scrolled');
    }
  }

  updateNavbarState();
  window.addEventListener('scroll', updateNavbarState, { passive: true });

  /* ----------------------------------------------------------------
     3. MOBILE MENU TOGGLE
     ---------------------------------------------------------------- */
  const navToggle = document.getElementById('navToggle');
  const mobileMenu = document.getElementById('mobileMenu');

  function closeMobileMenu() {
    if (!navToggle || !mobileMenu) return;
    navToggle.classList.remove('is-active');
    navToggle.setAttribute('aria-expanded', 'false');
    mobileMenu.classList.remove('is-open');
  }

  if (navToggle && mobileMenu) {
    navToggle.addEventListener('click', () => {
      const isOpen = mobileMenu.classList.toggle('is-open');
      navToggle.classList.toggle('is-active', isOpen);
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });

    // Close the mobile menu whenever a link inside it is clicked,
    // so navigating to a section doesn't leave the menu open.
    mobileMenu.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', closeMobileMenu);
    });
  }

  /* ----------------------------------------------------------------
     4. SMOOTH SCROLL FOR IN-PAGE ANCHOR LINKS
     CSS `scroll-behavior: smooth` already handles most of this,
     but we intercept clicks to correctly offset for the fixed
     navbar height and to support browsers with partial support.
     ---------------------------------------------------------------- */
  const anchorLinks = document.querySelectorAll('a[href^="#"]');
  const NAVBAR_OFFSET = 84;

  anchorLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
      const targetId = link.getAttribute('href');
      if (!targetId || targetId === '#') return;

      const targetEl = document.querySelector(targetId);
      if (!targetEl) return;

      event.preventDefault();
      const targetPosition = targetEl.getBoundingClientRect().top + window.scrollY - NAVBAR_OFFSET;

      window.scrollTo({
        top: targetPosition,
        behavior: 'smooth',
      });
    });
  });

  /* ----------------------------------------------------------------
     5. SCROLL REVEAL ANIMATIONS
     Elements marked with [data-reveal] fade/slide into view the
     first time they enter the viewport. Uses IntersectionObserver
     for performance (no scroll-position math on every frame).
     ---------------------------------------------------------------- */
  const revealElements = document.querySelectorAll('[data-reveal]');

  if ('IntersectionObserver' in window && revealElements.length) {
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Small stagger so grouped elements (e.g. feature cards)
            // don't all snap in at the exact same millisecond.
            const delay = Number(entry.target.dataset.revealDelay || 0);
            setTimeout(() => {
              entry.target.classList.add('is-visible');
            }, delay);
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.15,
        rootMargin: '0px 0px -40px 0px',
      }
    );

    // Apply a slight incremental stagger to consecutive siblings
    // within the same section (e.g. the 6 feature cards).
    let staggerIndex = 0;
    let lastParent = null;

    revealElements.forEach((el) => {
      if (el.parentElement !== lastParent) {
        staggerIndex = 0;
        lastParent = el.parentElement;
      }
      el.dataset.revealDelay = String(Math.min(staggerIndex * 70, 280));
      staggerIndex += 1;
      revealObserver.observe(el);
    });
  } else {
    // Fallback: if IntersectionObserver isn't supported, just show everything.
    revealElements.forEach((el) => el.classList.add('is-visible'));
  }

  /* ----------------------------------------------------------------
     6. DYNAMIC FOOTER YEAR
     ---------------------------------------------------------------- */
  const yearEl = document.getElementById('year');
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

});
