import { Guide, supportsWebGL } from './stage.mjs';

// Shows the SVG figure immediately, then crossfades to the 3D guide once it is built.
// Falls back to the SVG figure for good if WebGL is unavailable or the GPU context is lost.
class StageFigure {
  constructor(container) {
    this.container = container;
    this.guide = null;
    this.args = null;
    this.svg = new window.StretchMotion.Figure(container);
    container.dataset.renderer = 'svg';
    this.ready = new Promise((resolve) => {
      if (!supportsWebGL()) { resolve(false); return; }
      // Building the character takes a moment; let the window paint first.
      requestAnimationFrame(() => setTimeout(() => resolve(this.upgrade()), 0));
    });
  }

  upgrade() {
    let guide;
    try { guide = new Guide(this.container); } catch (error) { console.warn('3D guide unavailable', error); return false; }
    guide.onLost = () => this.downgrade();
    this.guide = guide;
    if (this.args) guide.render(...this.args);
    this.container.dataset.renderer = 'webgl';
    const svg = this.container.querySelector(':scope > svg');
    requestAnimationFrame(() => this.container.classList.add('guide-ready'));
    setTimeout(() => { if (this.guide === guide) svg?.remove(); }, 600);
    return true;
  }

  downgrade() {
    const guide = this.guide;
    this.guide = null;
    guide?.destroy();
    this.container.classList.remove('guide-ready');
    this.svg = new window.StretchMotion.Figure(this.container);
    this.container.dataset.renderer = 'svg';
    if (this.args) this.svg.render(...this.args);
  }

  render(...args) {
    this.args = args;
    (this.guide || this.svg).render(...args);
  }

  snapshot(ex, width, height, view) {
    return this.guide ? this.guide.snapshot(ex, width, height, view) : null;
  }
}

window.StretchGuide = { create: (container) => new StageFigure(container), supported: supportsWebGL };
