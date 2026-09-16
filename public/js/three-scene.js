/**
 * HeatWatch 3D Animation Engine
 * Powered by Three.js
 * Provides:
 * - Interactive 3D Thermal Globe for Landing Hero
 * - Holographic Volumetric 3D HTSI Gauge for Dashboard
 * - Ambient 3D Convective Thermal Particles
 */

'use strict';

window.HW_3D = (function () {
  const hasThree = typeof THREE !== 'undefined';

  // -------------------------------------------------------------
  // 1. HERO 3D THERMAL GLOBE
  // -------------------------------------------------------------
  function initHeroGlobe(containerId) {
    if (!hasThree) return;
    const container = document.getElementById(containerId);
    if (!container) return;

    const width = container.clientWidth || 480;
    const height = container.clientHeight || 480;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = 240;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const globeGroup = new THREE.Group();
    scene.add(globeGroup);

    // Inner wireframe sphere
    const sphereGeo = new THREE.SphereGeometry(78, 36, 36);
    const sphereMat = new THREE.MeshBasicMaterial({
      color: 0x153548,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    });
    const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
    globeGroup.add(sphereMesh);

    // Core glow sphere
    const coreGeo = new THREE.SphereGeometry(76, 32, 32);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x091428,
      transparent: true,
      opacity: 0.9,
    });
    globeGroup.add(new THREE.Mesh(coreGeo, coreMat));

    // Outer atmospheric glow shell
    const atmosphereGeo = new THREE.SphereGeometry(86, 32, 32);
    const atmosphereMat = new THREE.MeshBasicMaterial({
      color: 0x00f2fe,
      wireframe: true,
      transparent: true,
      opacity: 0.09,
    });
    globeGroup.add(new THREE.Mesh(atmosphereGeo, atmosphereMat));

    // Thermal Hotspots (lat, lon, heat color)
    const hotspots = [
      { lat: 28.61, lon: 77.23, color: 0xef4444, size: 4 },   // Delhi
      { lat: 19.07, lon: 72.87, color: 0xf97316, size: 3.5 }, // Mumbai
      { lat: 25.20, lon: 55.27, color: 0xec4899, size: 4 },   // Dubai
      { lat: 24.86, lon: 67.00, color: 0xef4444, size: 3.5 }, // Karachi
      { lat: 13.08, lon: 80.27, color: 0xf97316, size: 3 },   // Chennai
      { lat: 33.44, lon: -112.07, color: 0xef4444, size: 3.8 }, // Phoenix
      { lat: 37.38, lon: -5.98, color: 0xf59e0b, size: 3 },   // Seville
      { lat: -23.55, lon: -46.63, color: 0x10b981, size: 2.5 }, // Sao Paulo
      { lat: 35.67, lon: 139.65, color: 0x00f2fe, size: 2.5 }, // Tokyo
    ];

    function latLonToVector3(lat, lon, radius) {
      const phi = (90 - lat) * (Math.PI / 180);
      const theta = (lon + 180) * (Math.PI / 180);
      return new THREE.Vector3(
        -radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta)
      );
    }

    const pulseRings = [];
    hotspots.forEach((h) => {
      const pos = latLonToVector3(h.lat, h.lon, 80);
      // Pin dot
      const dotGeo = new THREE.SphereGeometry(h.size, 16, 16);
      const dotMat = new THREE.MeshBasicMaterial({ color: h.color });
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.position.copy(pos);
      globeGroup.add(dot);

      // Pulsing wave ring
      const ringGeo = new THREE.RingGeometry(h.size * 1.2, h.size * 2.2, 24);
      const ringMat = new THREE.MeshBasicMaterial({
        color: h.color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.copy(pos);
      ring.lookAt(0, 0, 0);
      globeGroup.add(ring);
      pulseRings.push({ mesh: ring, baseScale: 1, color: h.color });
    });

    // Atmospheric particle swarm
    const particleCount = 400;
    const particleGeo = new THREE.BufferGeometry();
    const particlePos = new Float32Array(particleCount * 3);
    const particleColors = new Float32Array(particleCount * 3);

    const palette = [
      new THREE.Color(0x00f2fe),
      new THREE.Color(0xf59e0b),
      new THREE.Color(0xf97316),
      new THREE.Color(0xef4444),
    ];

    for (let i = 0; i < particleCount; i++) {
      const r = 85 + Math.random() * 32;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);

      particlePos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      particlePos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      particlePos[i * 3 + 2] = r * Math.cos(phi);

      const col = palette[Math.floor(Math.random() * palette.length)];
      particleColors[i * 3] = col.r;
      particleColors[i * 3 + 1] = col.g;
      particleColors[i * 3 + 2] = col.b;
    }

    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
    particleGeo.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));

    const particleMat = new THREE.PointsMaterial({
      size: 2.2,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    globeGroup.add(particles);

    // Initial orientation: focus towards India & South Asia
    globeGroup.rotation.x = 0.35;
    globeGroup.rotation.y = -1.2;

    // Interactive Drag & Parallax
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;
    let targetRotX = 0.35;
    let targetRotY = -1.2;
    let autoRotate = true;

    container.addEventListener('mousedown', (e) => {
      isDragging = true;
      autoRotate = false;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
      setTimeout(() => (autoRotate = true), 2500);
    });

    window.addEventListener('mousemove', (e) => {
      if (isDragging) {
        const deltaX = e.clientX - prevMouseX;
        const deltaY = e.clientY - prevMouseY;
        targetRotY += deltaX * 0.006;
        targetRotX += deltaY * 0.006;
        prevMouseX = e.clientX;
        prevMouseY = e.clientY;
      }
    });

    // Touch support
    container.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        isDragging = true;
        autoRotate = false;
        prevMouseX = e.touches[0].clientX;
        prevMouseY = e.touches[0].clientY;
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (isDragging && e.touches.length === 1) {
        const deltaX = e.touches[0].clientX - prevMouseX;
        const deltaY = e.touches[0].clientY - prevMouseY;
        targetRotY += deltaX * 0.007;
        targetRotX += deltaY * 0.007;
        prevMouseX = e.touches[0].clientX;
        prevMouseY = e.touches[0].clientY;
      }
    }, { passive: true });

    window.addEventListener('touchend', () => {
      isDragging = false;
      setTimeout(() => (autoRotate = true), 2500);
    });

    // Animation loop
    let clock = new THREE.Clock();
    let animId;

    function animate() {
      animId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsedTime = clock.getElapsedTime();

      if (autoRotate) {
        targetRotY += delta * 0.22;
      }

      globeGroup.rotation.y += (targetRotY - globeGroup.rotation.y) * 0.08;
      globeGroup.rotation.x += (targetRotX - globeGroup.rotation.x) * 0.08;

      // Pulse hotspot rings
      pulseRings.forEach((r, idx) => {
        const wave = (Math.sin(elapsedTime * 3 + idx) + 1) * 0.5;
        r.mesh.scale.set(1 + wave * 0.6, 1 + wave * 0.6, 1);
        r.mesh.material.opacity = 0.85 - wave * 0.65;
      });

      // Swirl particles
      particles.rotation.y += delta * 0.06;

      renderer.render(scene, camera);
    }
    animate();

    function onResize() {
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      if (!newWidth || !newHeight) return;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    }
    window.addEventListener('resize', onResize);

    return {
      destroy: () => {
        cancelAnimationFrame(animId);
        window.removeEventListener('resize', onResize);
        renderer.dispose();
      }
    };
  }

  // -------------------------------------------------------------
  // 2. HOLOGRAPHIC 3D VOLUMETRIC HTSI GAUGE (Dashboard)
  // -------------------------------------------------------------
  let holoInstance = null;

  function initHoloGauge(containerId) {
    if (!hasThree) return;
    const container = document.getElementById(containerId);
    if (!container) return;

    const size = Math.min(container.clientWidth || 190, 220);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
    camera.position.z = 120;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const gaugeGroup = new THREE.Group();
    scene.add(gaugeGroup);

    // 1. Concentric Holographic Rings
    const ring1Geo = new THREE.RingGeometry(36, 38, 48);
    const ring1Mat = new THREE.MeshBasicMaterial({
      color: 0x00f2fe,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.3,
    });
    const ring1 = new THREE.Mesh(ring1Geo, ring1Mat);
    gaugeGroup.add(ring1);

    const ring2Geo = new THREE.RingGeometry(42, 43, 64);
    const ring2Mat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.4,
    });
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    gaugeGroup.add(ring2);

    // 2. Inner Orbiting Particle Swarm
    const pCount = 140;
    const pGeo = new THREE.BufferGeometry();
    const pPos = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      const ang = (i / pCount) * Math.PI * 2;
      const rad = 28 + Math.random() * 12;
      pPos[i * 3] = Math.cos(ang) * rad;
      pPos[i * 3 + 1] = Math.sin(ang) * rad;
      pPos[i * 3 + 2] = (Math.random() - 0.5) * 16;
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const pMat = new THREE.PointsMaterial({
      size: 2.2,
      color: 0x00f2fe,
      transparent: true,
      opacity: 0.8,
    });
    const particleRing = new THREE.Points(pGeo, pMat);
    gaugeGroup.add(particleRing);

    // 3. Central Pulsing Core
    const coreGeo = new THREE.SphereGeometry(14, 24, 24);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x00f2fe,
      wireframe: true,
      transparent: true,
      opacity: 0.4,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    gaugeGroup.add(core);

    // 4. Scanner Needle Blade
    const needleGeo = new THREE.PlaneGeometry(3, 40);
    const needleMat = new THREE.MeshBasicMaterial({
      color: 0x00f2fe,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
    });
    const needle = new THREE.Mesh(needleGeo, needleMat);
    needle.position.y = 20;
    const needlePivot = new THREE.Group();
    needlePivot.add(needle);
    gaugeGroup.add(needlePivot);

    // Tilt for 3D perspective
    gaugeGroup.rotation.x = 0.5;
    gaugeGroup.rotation.y = -0.3;

    let targetColor = new THREE.Color(0x00f2fe);
    let currentColor = new THREE.Color(0x00f2fe);
    let targetSpeed = 1.0;
    let currentSpeed = 1.0;
    let targetNeedleAngle = 0;

    let clock = new THREE.Clock();
    let animId;

    function animate() {
      animId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      // Smooth color transitions
      currentColor.lerp(targetColor, 0.05);
      currentSpeed += (targetSpeed - currentSpeed) * 0.05;

      ring1Mat.color.copy(currentColor);
      ring2Mat.color.copy(currentColor);
      pMat.color.copy(currentColor);
      coreMat.color.copy(currentColor);
      needleMat.color.copy(currentColor);

      // Rotations
      ring1.rotation.z -= delta * 0.4 * currentSpeed;
      ring2.rotation.z += delta * 0.25 * currentSpeed;
      particleRing.rotation.z += delta * 0.9 * currentSpeed;
      particleRing.rotation.x = Math.sin(elapsed * 1.5) * 0.2;
      core.rotation.y += delta * 1.2 * currentSpeed;
      core.rotation.x += delta * 0.6 * currentSpeed;

      // Pulse core scale
      const pulse = 1 + Math.sin(elapsed * 4 * currentSpeed) * 0.12;
      core.scale.set(pulse, pulse, pulse);

      // Smooth needle move
      needlePivot.rotation.z += (targetNeedleAngle - needlePivot.rotation.z) * 0.06;

      renderer.render(scene, camera);
    }
    animate();

    holoInstance = {
      update: function (htsi, level, colorHex) {
        if (colorHex) {
          targetColor = new THREE.Color(colorHex);
        }
        const val = typeof htsi === 'number' ? htsi : 0;
        // Speed up when hotter
        targetSpeed = 0.8 + (val / 100) * 3.5;
        // Needle angle maps 0..100 to 2.4 rad to -2.4 rad
        targetNeedleAngle = 2.4 - (Math.min(100, Math.max(0, val)) / 100) * 4.8;
      },
      destroy: () => {
        cancelAnimationFrame(animId);
        renderer.dispose();
      }
    };

    return holoInstance;
  }

  function updateGauge(htsi, level, colorHex) {
    if (holoInstance && holoInstance.update) {
      holoInstance.update(htsi, level, colorHex);
    }
  }

  // -------------------------------------------------------------
  // 3. AMBIENT 3D PARTICLES (Subtle background turbulence)
  // -------------------------------------------------------------
  function initAmbientParticles(canvasId) {
    if (!hasThree) return;
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, width / height, 1, 1000);
    camera.position.z = 400;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    const count = 180;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 900;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 700;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 400;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    const mat = new THREE.PointsMaterial({
      size: 2.5,
      color: 0x00f2fe,
      transparent: true,
      opacity: 0.22,
    });
    const points = new THREE.Points(geo, mat);
    scene.add(points);

    let mouseX = 0;
    let mouseY = 0;
    window.addEventListener('mousemove', (e) => {
      mouseX = (e.clientX - width / 2) * 0.05;
      mouseY = (e.clientY - height / 2) * 0.05;
    });

    let animId;
    function animate() {
      animId = requestAnimationFrame(animate);
      points.rotation.y += 0.0006;
      points.rotation.x += 0.0003;
      camera.position.x += (mouseX - camera.position.x) * 0.02;
      camera.position.y += (-mouseY - camera.position.y) * 0.02;
      renderer.render(scene, camera);
    }
    animate();

    function onResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
    window.addEventListener('resize', onResize);

    return {
      destroy: () => {
        cancelAnimationFrame(animId);
        window.removeEventListener('resize', onResize);
        renderer.dispose();
      }
    };
  }

  return {
    initHeroGlobe,
    initHoloGauge,
    updateGauge,
    initAmbientParticles,
  };
})();
