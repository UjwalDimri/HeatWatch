/**
 * HeatWatch 3D Card Tilt & Interactive Specular Parallax Engine
 */

'use strict';

window.HW_3DCARD = (function () {
  const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function attachTilt(card) {
    if (isReduced || !card || card.__has3dTilt) return;
    card.__has3dTilt = true;

    // Create dynamic glare overlay
    let glare = card.querySelector('.card-glare');
    if (!glare) {
      glare = document.createElement('div');
      glare.className = 'card-glare';
      card.appendChild(glare);
    }

    let rect = card.getBoundingClientRect();
    let isHovered = false;

    function onMouseEnter() {
      rect = card.getBoundingClientRect();
      isHovered = true;
      card.style.transition = 'transform 0.1s ease-out, box-shadow 0.2s ease-out';
      if (glare) glare.style.opacity = '1';
    }

    function onMouseMove(e) {
      if (!isHovered) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      // Limit rotation to max 8 degrees for clean ergonomic feel
      const rotateX = ((y - centerY) / centerY) * -6;
      const rotateY = ((x - centerX) / centerX) * 6;

      card.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateZ(8px)`;

      if (glare) {
        const angle = Math.atan2(y - centerY, x - centerX) * (180 / Math.PI) - 90;
        glare.style.background = `linear-gradient(${angle}deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 60%)`;
      }
    }

    function onMouseLeave() {
      isHovered = false;
      card.style.transition = 'transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.6s ease-out';
      card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateZ(0px)';
      if (glare) {
        glare.style.opacity = '0';
      }
    }

    card.addEventListener('mouseenter', onMouseEnter);
    card.addEventListener('mousemove', onMouseMove);
    card.addEventListener('mouseleave', onMouseLeave);
  }

  function init(selector = '.panel, .card-3d, .flow-card') {
    document.querySelectorAll(selector).forEach(attachTilt);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init());
  } else {
    init();
  }

  return { init, attachTilt };
})();
