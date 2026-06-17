// Type declarations for scoped PixiJS internal modules used by the Orbit map
// worker. These modules are not exported by PixiJS's package.json exports map,
// so we declare them here and let webpack resolve the physical files via an alias.

declare module 'pixi.js/lib/app/Application.mjs' {
  export { Application } from 'pixi.js';
}

declare module 'pixi.js/lib/app/init.mjs' {
  const init: unknown;
  export default init;
}

declare module 'pixi.js/lib/environment/adapter.mjs' {
  export { DOMAdapter } from 'pixi.js';
}

declare module 'pixi.js/lib/scene/index.mjs' {
  export { Container, Graphics, Sprite } from 'pixi.js';
}

declare module 'pixi.js/lib/scene/graphics/init.mjs' {
  const init: unknown;
  export default init;
}

declare module 'pixi.js/lib/scene/text-bitmap/init.mjs' {
  const init: unknown;
  export default init;
}

declare module 'pixi.js/lib/scene/text-bitmap/BitmapFont.mjs' {
  export { BitmapFont } from 'pixi.js';
}

declare module 'pixi.js/lib/scene/text-bitmap/BitmapFontManager.mjs' {
  export { BitmapFontManager } from 'pixi.js';
}

declare module 'pixi.js/lib/scene/text-bitmap/BitmapText.mjs' {
  export { BitmapText } from 'pixi.js';
}

declare module 'pixi.js/lib/rendering/init.mjs' {
  const init: unknown;
  export default init;
}

declare module 'pixi.js/lib/rendering/renderers/shared/texture/Texture.mjs' {
  export { Texture } from 'pixi.js';
}
