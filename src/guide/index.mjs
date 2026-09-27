import { Guide, supportsWebGL } from './stage.mjs';

// The 3D guide fades in once it is built. The SVG figure is only a fallback, used when WebGL is
// unavailable, the guide cannot be built, or the GPU context is lost.
class StageFigure {
  constructor(container) {
    this.container = container;
    this.guide = null;
    this.svg = null;
    this.args = null;
    this.pending = supportsWebGL();
    if (!this.pending) { this.fallback(); this.ready = Promise.resolve(false); return; }
    container.dataset.renderer = 'pending';
    this.ready = new Promise((resolve) => {
      // Building the character takes a moment: wait until the figure is near the viewport and the page is idle.
      const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 0));
      const observer = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) this.load();
      }, { rootMargin: '300px' });
      this.load = () => {
        if (this.loading) return;
        this.loading = true;
        observer.disconnect();
        requestAnimationFrame(() => idle(() => resolve(this.upgrade()), { timeout: 300 }));
      };
      observer.observe(container);
    });
  }

  load() {}

  upgrade() {
    this.pending = false;
    let guide;
    try { guide = new Guide(this.container); } catch (error) {
      console.warn('3D guide unavailable', error);
      this.fallback();
      return false;
    }
    guide.onLost = () => { this.guide = null; guide.destroy(); this.fallback(); };
    this.guide = guide;
    if (this.args) guide.render(...this.args);
    this.container.dataset.renderer = 'webgl';
    requestAnimationFrame(() => this.container.classList.add('guide-ready'));
    return true;
  }

  fallback() {
    this.container.classList.remove('guide-ready');
    this.svg = new window.StretchMotion.Figure(this.container);
    this.container.dataset.renderer = 'svg';
    if (this.args) this.svg.render(...this.args);
  }

  render(...args) {
    this.args = args;
    (this.guide || this.svg)?.render(...args);
  }

  snapshot(ex, width, height, view) {
    return this.guide ? this.guide.snapshot(ex, width, height, view) : null;
  }
}

window.StretchGuide = { create: (container) => new StageFigure(container), supported: supportsWebGL };
