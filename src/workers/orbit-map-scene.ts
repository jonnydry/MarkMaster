/**
 * Atmosphere helpers for the Orbit map worker: gradient textures (glow,
 * vignette) and the parallax starfield. Pure scene-construction code so the
 * worker entry point stays focused on orchestration.
 */

import { Container, Graphics, Sprite, Texture } from "pixi.js";

import type { OrbitMapColorMode } from "@/lib/orbit-map-palette";

/** Renders a radial gradient onto an OffscreenCanvas and wraps it in a Texture. */
export function createOrbitMapRadialGradientTexture(
  size: number,
  stops: Array<[number, string]>
): Texture {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");
  if (!ctx) return Texture.WHITE;
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  for (const [offset, color] of stops) {
    gradient.addColorStop(offset, color);
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return Texture.from(canvas);
}

/** Soft white radial glow used for hub glows and cluster halos (tinted). */
export function createOrbitMapGlowTexture(): Texture {
  return createOrbitMapRadialGradientTexture(64, [
    [0, "rgba(255,255,255,0.85)"],
    [0.35, "rgba(255,255,255,0.28)"],
    [1, "rgba(255,255,255,0)"],
  ]);
}

export function createOrbitMapVignetteSprite(
  mode: OrbitMapColorMode = "dark"
): Sprite {
  const stops =
    mode === "light"
      ? ([
          [0, "rgba(15,23,42,0.05)"],
          [0.55, "rgba(15,23,42,0.025)"],
          [1, "rgba(0,0,0,0)"],
        ] as Array<[number, string]>)
      : ([
          [0, "rgba(30,41,59,0.5)"],
          [0.55, "rgba(15,23,42,0.22)"],
          [1, "rgba(0,0,0,0)"],
        ] as Array<[number, string]>);
  const texture = createOrbitMapRadialGradientTexture(256, stops);
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5);
  return sprite;
}

/** Mulberry32 — tiny deterministic PRNG so the starfield is stable per session. */
function createSeededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fills the container with distant stars (rebuilt when color mode changes). */
export function buildOrbitMapStarfield(
  container: Container,
  mode: OrbitMapColorMode = "dark"
) {
  container.removeChildren();
  const random = createSeededRandom(0x0c0ffee);
  const stars = new Graphics();
  for (let i = 0; i < 240; i++) {
    const x = (random() - 0.5) * 6000;
    const y = (random() - 0.5) * 6000;
    const radius = 0.4 + random() * 1.0;
    const blue = random() > 0.7;
    stars.circle(x, y, radius);
    stars.fill({
      color:
        mode === "light"
          ? blue
            ? 0x2563eb
            : 0x64748b
          : blue
            ? 0x93c5fd
            : 0xffffff,
      alpha:
        mode === "light"
          ? 0.03 + random() * 0.08
          : 0.05 + random() * 0.14,
    });
  }
  container.addChild(stars);
}
