/**
 * Scoped PixiJS imports for the Orbit map web worker.
 *
 * Importing the full `pixi.js` entry pulls in accessibility, filters,
 * assets, WebGPU renderer, spritesheets, etc. that the worker never uses.
 * This module imports only the features the Orbit map needs and exports them
 * with the same names the worker expects.
 */

// Side-effect: register texture sources (CanvasSource, ImageSource, etc.) and
// Texture.from / TextureSource.from helpers.
import 'pixi.js/lib/rendering/init.mjs';
// Side-effect: register Application plugins (ResizePlugin, TickerPlugin).
import 'pixi.js/lib/app/init.mjs';
// Side-effect: register Graphics rendering pipe.
import 'pixi.js/lib/scene/graphics/init.mjs';
// Side-effect: register BitmapText rendering pipe.
import 'pixi.js/lib/scene/text-bitmap/init.mjs';

export { Application } from 'pixi.js/lib/app/Application.mjs';
export { DOMAdapter } from 'pixi.js/lib/environment/adapter.mjs';
export { Container, Graphics, Sprite } from 'pixi.js/lib/scene/index.mjs';
export { Texture } from 'pixi.js/lib/rendering/renderers/shared/texture/Texture.mjs';
export { BitmapFont } from 'pixi.js/lib/scene/text-bitmap/BitmapFont.mjs';
export { BitmapFontManager } from 'pixi.js/lib/scene/text-bitmap/BitmapFontManager.mjs';
export { BitmapText } from 'pixi.js/lib/scene/text-bitmap/BitmapText.mjs';

// The official WebWorkerAdapter imports `@xmldom/xmldom` for parseXML, which
// adds ~50 KB to the worker bundle. The Orbit map never parses XML/SVG, so we
// provide a minimal adapter that drops that dependency.
const workerAdapter = {
  createCanvas: (width?: number, height?: number) =>
    new OffscreenCanvas(width ?? 0, height ?? 0),
  createImage: () => {
    throw new Error('Image creation is not used in the Orbit worker');
  },
  getCanvasRenderingContext2D: () => OffscreenCanvasRenderingContext2D,
  getWebGLRenderingContext: () => WebGLRenderingContext,
  getNavigator: () => navigator,
  getBaseUrl: () => self.location.href,
  getFontFaceSet: () => self.fonts ?? null,
  fetch: (url: RequestInfo, options?: RequestInit) => fetch(url, options),
  parseXML: () => {
    throw new Error('XML parsing is not used in the Orbit worker');
  },
};

export { workerAdapter as WebWorkerAdapter };
