"use client";

import { useEffect, useRef } from "react";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
  radius: number;
  hue: number;
};

type NebulaBackgroundProps = {
  particleCount?: number;
  trailAlpha?: number;
  glowStrength?: number;
};

function spawnParticle(width: number, height: number): Particle {
  const originX = width * 0.5;
  const originY = height * 0.42;
  const angle = Math.random() * Math.PI * 2;
  const speed = 0.18 + Math.random() * 1.35;
  return {
    x: originX + (Math.random() - 0.5) * 18,
    y: originY + (Math.random() - 0.5) * 18,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: 180 + Math.random() * 320,
    age: 0,
    radius: 0.8 + Math.random() * 2.8,
    hue: 188 + Math.random() * 46,
  };
}

export function NebulaBackground({
  particleCount = 320,
  trailAlpha = 0.12,
  glowStrength = 18,
}: NebulaBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasEl = canvas;
    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;
    const context = ctx;

    let frameId = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let particles: Particle[] = [];
    let tick = 0;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvasEl.width = Math.floor(width * dpr);
      canvasEl.height = Math.floor(height * dpr);
      canvasEl.style.width = `${width}px`;
      canvasEl.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles = Array.from({ length: particleCount }, () => spawnParticle(width, height));
    }

    function paintBackdrop() {
      const centerX = width * 0.5;
      const centerY = height * 0.42;
      const sky = context.createLinearGradient(0, 0, 0, height);
      sky.addColorStop(0, "rgba(3,6,17,1)");
      sky.addColorStop(0.48, "rgba(4,9,23,1)");
      sky.addColorStop(1, "rgba(1,2,8,1)");
      context.fillStyle = sky;
      context.fillRect(0, 0, width, height);

      const burst = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.min(width, height) * 0.42);
      burst.addColorStop(0, "rgba(132,221,255,0.18)");
      burst.addColorStop(0.22, "rgba(95,142,255,0.11)");
      burst.addColorStop(0.42, "rgba(67,70,156,0.07)");
      burst.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = burst;
      context.fillRect(0, 0, width, height);

      const warmCore = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.min(width, height) * 0.12);
      warmCore.addColorStop(0, "rgba(255,199,132,0.16)");
      warmCore.addColorStop(0.42, "rgba(255,126,94,0.07)");
      warmCore.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = warmCore;
      context.fillRect(0, 0, width, height);
    }

    function drawDustLanes(time: number) {
      const centerX = width * 0.5;
      const centerY = height * 0.42;
      context.save();
      context.globalCompositeOperation = "screen";
      for (let i = 0; i < 6; i += 1) {
        const angle = time * 0.00018 + i * (Math.PI / 3);
        const laneX = centerX + Math.cos(angle) * (120 + i * 26);
        const laneY = centerY + Math.sin(angle) * (80 + i * 18);
        const gradient = context.createRadialGradient(laneX, laneY, 0, laneX, laneY, 180 + i * 24);
        gradient.addColorStop(0, `rgba(${i % 2 === 0 ? "96,194,255" : "255,138,94"},0.028)`);
        gradient.addColorStop(0.55, `rgba(${i % 2 === 0 ? "55,99,220" : "180,86,132"},0.016)`);
        gradient.addColorStop(1, "rgba(0,0,0,0)");
        context.fillStyle = gradient;
        context.beginPath();
        context.ellipse(laneX, laneY, 240 + i * 20, 90 + i * 12, angle, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
    }

    function animate() {
      context.fillStyle = `rgba(2,6,17,${trailAlpha})`;
      context.fillRect(0, 0, width, height);
      paintBackdrop();
      drawDustLanes(tick);

      const centerX = width * 0.5;
      const centerY = height * 0.42;
      context.shadowBlur = glowStrength;
      context.shadowColor = "rgba(112,214,255,0.72)";

      for (const particle of particles) {
        particle.age += 1;
        if (particle.age >= particle.life) {
          Object.assign(particle, spawnParticle(width, height));
        }

        const driftX = Math.sin((tick + particle.hue) * 0.008) * 0.014;
        const driftY = Math.cos((tick + particle.hue) * 0.006) * 0.012;
        particle.vx *= 0.992;
        particle.vy *= 0.992;
        particle.x += particle.vx + driftX;
        particle.y += particle.vy + driftY;

        const lifeRatio = particle.age / particle.life;
        const opacity = Math.sin(lifeRatio * Math.PI) * 0.45;
        const distance = Math.hypot(particle.x - centerX, particle.y - centerY);
        const hue = particle.hue - distance * 0.035;

        context.fillStyle = `hsla(${hue}, 88%, ${68 - lifeRatio * 18}%, ${opacity})`;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.radius * (1 - lifeRatio * 0.35), 0, Math.PI * 2);
        context.fill();
      }

      context.shadowBlur = 0;
      tick += 1;
      frameId = window.requestAnimationFrame(animate);
    }

    resize();
    paintBackdrop();
    animate();
    window.addEventListener("resize", resize);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
    };
  }, [particleCount, trailAlpha, glowStrength]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 h-full w-full"
      aria-hidden="true"
    />
  );
}
