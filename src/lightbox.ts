// Full-screen viewer for diagrams and images: fit / 100% / zoom around the pointer, drag to pan, pinch on touch.

const MIN = 0.1;
const MAX = 8;

interface Source {
  node: SVGSVGElement | HTMLImageElement;
  width: number;
  height: number;
}

function sourceOf(el: Element): Source | null {
  if (el instanceof HTMLImageElement) {
    if (!el.naturalWidth) return null;
    const img = el.cloneNode() as HTMLImageElement;
    return { node: img, width: el.naturalWidth, height: el.naturalHeight };
  }
  const svg = el instanceof SVGSVGElement ? el : el.querySelector('svg');
  if (!svg) return null;
  const vb = svg.viewBox.baseVal;
  const box = svg.getBoundingClientRect();
  const width = vb?.width || box.width;
  const height = vb?.height || box.height;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  // Mermaid pins max-width to its natural size; the viewer sizes the clone itself.
  clone.style.maxWidth = 'none';
  clone.removeAttribute('width');
  clone.removeAttribute('height');
  return { node: clone, width, height };
}

export function openLightbox(target: Element, title: string): void {
  const src = sourceOf(target);
  if (!src) return;
  const returnFocus = document.activeElement as HTMLElement | null;
  const { node, width, height } = src;

  const overlay = document.createElement('div');
  overlay.className = 'lightbox';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', title);
  overlay.innerHTML = `
    <div class="lightbox-bar">
      <span class="lightbox-title"></span>
      <span class="lightbox-tools">
        <button data-lb="out" title="축소 (-)">－</button>
        <button data-lb="fit" class="lightbox-zoom" title="화면에 맞춤 (0)"></button>
        <button data-lb="in" title="확대 (+)">＋</button>
        <button data-lb="fit" title="화면에 맞춤 (0)">맞춤</button>
        <button data-lb="actual" title="원본 크기 (1)">100%</button>
        <button data-lb="close" title="닫기 (Esc)">닫기</button>
      </span>
    </div>
    <div class="lightbox-stage" tabindex="-1"></div>
    <div class="lightbox-hint">휠: 확대·축소 · 드래그: 이동 · 더블클릭: 맞춤/100%</div>`;
  overlay.querySelector('.lightbox-title')!.textContent = title;
  const stage = overlay.querySelector<HTMLElement>('.lightbox-stage')!;
  const zoomLabel = overlay.querySelector<HTMLElement>('.lightbox-zoom')!;
  node.classList.add('lightbox-content');
  stage.append(node);

  let scale = 1;
  let x = 0;
  let y = 0;

  const apply = () => {
    node.style.width = `${width * scale}px`;
    node.style.height = `${height * scale}px`;
    node.style.transform = `translate(${x}px, ${y}px)`;
    zoomLabel.textContent = `${Math.round(scale * 100)}%`;
  };

  const fitScale = () => {
    const pad = 32;
    return Math.min(MAX, Math.max(MIN, Math.min((stage.clientWidth - pad) / width, (stage.clientHeight - pad) / height)));
  };

  const center = (s: number) => {
    scale = s;
    x = (stage.clientWidth - width * s) / 2;
    y = Math.max(16, (stage.clientHeight - height * s) / 2);
    apply();
  };

  /** Zooms keeping the stage point (px, py) still. */
  const zoomAt = (next: number, px = stage.clientWidth / 2, py = stage.clientHeight / 2) => {
    next = Math.min(MAX, Math.max(MIN, next));
    x = px - ((px - x) * next) / scale;
    y = py - ((py - y) * next) / scale;
    scale = next;
    apply();
  };

  const stagePoint = (e: { clientX: number; clientY: number }) => {
    const r = stage.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };

  stage.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      // Trackpad pinch arrives as ctrl+wheel with small deltas; mouse wheels give ~100 per notch.
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      zoomAt(scale * factor, ...stagePoint(e));
    },
    { passive: false },
  );

  // Drag to pan; two pointers pinch.
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch: { dist: number; scale: number } | null = null;
  stage.addEventListener('pointerdown', (e) => {
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    stage.classList.add('dragging');
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale };
    }
  });
  stage.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, cur);
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const mid = stagePoint({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
      zoomAt((pinch.scale * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.dist, ...mid);
    } else if (pointers.size === 1) {
      x += cur.x - prev.x;
      y += cur.y - prev.y;
      apply();
    }
  });
  const release = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!pointers.size) stage.classList.remove('dragging');
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);
  stage.addEventListener('dblclick', (e) => {
    const fit = fitScale();
    if (Math.abs(scale - fit) < 0.01) zoomAt(1, ...stagePoint(e));
    else center(fit);
  });

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    returnFocus?.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    const k = e.key;
    if (k === 'Escape') close();
    else if (k === '+' || k === '=') zoomAt(scale * 1.25);
    else if (k === '-' || k === '_') zoomAt(scale / 1.25);
    else if (k === '0') center(fitScale());
    else if (k === '1') center(1);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  const onResize = () => center(fitScale());

  overlay.addEventListener('click', (e) => {
    const action = (e.target as HTMLElement).closest<HTMLElement>('[data-lb]')?.dataset.lb;
    if (action === 'close') close();
    else if (action === 'in') zoomAt(scale * 1.25);
    else if (action === 'out') zoomAt(scale / 1.25);
    else if (action === 'fit') center(fitScale());
    else if (action === 'actual') center(1);
  });
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', onResize);

  // Inside an element in browser fullscreen, only that element's subtree is visible.
  (document.fullscreenElement ?? document.body).append(overlay);
  center(fitScale());
  stage.focus();
}
