/**
 * Atmosphere helpers for the Orbit map worker: gradient textures (glow,
 * nebula, vignette) and the multi-depth parallax starfield. Pure
 * scene-construction code so the worker entry point stays focused on
 * orchestration.
 */

import { Container, Graphics, Sprite, Texture } from "@/lib/pixi-imports";

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

/**
 * Much softer, wider falloff than the glow texture — tinted per cluster and
 * stretched to several cluster radii, it reads as a faint nebula field.
 */
export function createOrbitMapNebulaTexture(): Texture {
  return createOrbitMapRadialGradientTexture(128, [
    [0, "rgba(255,255,255,0.5)"],
    [0.4, "rgba(255,255,255,0.2)"],
    [0.75, "rgba(255,255,255,0.06)"],
    [1, "rgba(255,255,255,0)"],
  ]);
}

function pixiColorToRgb(color: number): [number, number, number] {
  return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
}

export function createOrbitMapVignetteSprite(
  mode: OrbitMapColorMode = "dark",
  accent?: number
): Sprite {
  let stops: Array<[number, string]>;
  if (mode === "light") {
    stops = [
      [0, "rgba(15,23,42,0.06)"],
      [0.55, "rgba(15,23,42,0.025)"],
      [1, "rgba(0,0,0,0)"],
    ];
  } else if (typeof accent === "number") {
    const [r, g, b] = pixiColorToRgb(accent);
    stops = [
      [0, `rgba(${r},${g},${b},0.04)`],
      [0.55, `rgba(${r},${g},${b},0.015)`],
      [1, "rgba(0,0,0,0)"],
    ];
  } else {
    stops = [
      [0, "rgba(30,41,59,0.07)"],
      [0.55, "rgba(15,23,42,0.025)"],
      [1, "rgba(0,0,0,0)"],
    ];
  }
  const texture = createOrbitMapRadialGradientTexture(256, stops);
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5);
  return sprite;
}

/** Mulberry32 — tiny deterministic PRNG so the starfield is stable per session. */
export function createOrbitMapSeededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a hash so per-cluster randomness (nebula offsets) is deterministic. */
export function hashOrbitMapStringToSeed(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Starfield depth layers, nearest last. Each layer pans with the camera at
 * its own fraction of camera speed, so panning/zooming reads as dimensional.
 */
export const ORBIT_MAP_STARFIELD_LAYERS = [
  { parallax: 0.12, count: 150, minRadius: 0.3, radiusRange: 0.55, alphaScale: 0.7, seed: 0x0c0ffee },
  { parallax: 0.3, count: 110, minRadius: 0.45, radiusRange: 0.75, alphaScale: 1, seed: 0xbeefcafe },
  { parallax: 0.55, count: 70, minRadius: 0.6, radiusRange: 1.05, alphaScale: 1.3, seed: 0x51a55ed },
] as const;

export function buildOrbitMapStarfield(
  container: Container,
  mode: OrbitMapColorMode = "dark",
  accent?: number
) {
  container.removeChildren();
  const accentStarColor =
    accent ??
    (mode === "light" ? 0x64748b : 0xd4d4d4);
  for (const layer of ORBIT_MAP_STARFIELD_LAYERS) {
    const random = createOrbitMapSeededRandom(layer.seed);
    const stars = new Graphics();
    for (let i = 0; i < layer.count; i++) {
      const x = (random() - 0.5) * 6000;
      const y = (random() - 0.5) * 6000;
      const radius = layer.minRadius + random() * layer.radiusRange;
      const tinted = random() > 0.7;
      const baseAlpha =
        mode === "light"
          ? 0.06 + random() * 0.12
          : 0.05 + random() * 0.14;
      stars.circle(x, y, radius);
      stars.fill({
        color:
          mode === "light"
            ? tinted
              ? accentStarColor
              : 0x475569
            : tinted
              ? accentStarColor
              : 0xffffff,
        alpha: Math.min(0.3, baseAlpha * layer.alphaScale),
      });
    }
    container.addChild(stars);
  }
}

/**
 * Positions each starfield layer at its own parallax fraction of the camera
 * offset. Layers are matched to ORBIT_MAP_STARFIELD_LAYERS by child order.
 */
export function applyOrbitMapStarfieldParallax(
  container: Container,
  cameraX: number,
  cameraY: number
) {
  const layers = ORBIT_MAP_STARFIELD_LAYERS;
  for (let i = 0; i < container.children.length; i++) {
    const parallax = layers[Math.min(i, layers.length - 1)].parallax;
    container.children[i].position.set(cameraX * parallax, cameraY * parallax);
  }
}
