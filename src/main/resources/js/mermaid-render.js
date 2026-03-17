/**
 * mermaid-render.js
 * Renders all Mermaid macro instances on the page as interactive SVGs.
 * Supports pan, zoom, fullscreen, and optional SVG download.
 */
(function (global) {
    'use strict';

    var panZoomState = {};

    // ------------------------------------------------------------------
    // Pan & zoom
    // ------------------------------------------------------------------

    function initPanZoom(diagramId, svgEl, container) {
        var state = { scale: 1, tx: 0, ty: 0, dragging: false, startX: 0, startY: 0 };
        panZoomState[diagramId] = state;

        svgEl.style.cursor        = 'grab';
        svgEl.style.userSelect    = 'none';
        svgEl.style.display       = 'block';
        svgEl.style.transformOrigin = '0 0';

        function applyTransform() {
            svgEl.style.transform =
                'translate(' + state.tx + 'px,' + state.ty + 'px) scale(' + state.scale + ')';
        }

        container.addEventListener('wheel', function (e) {
            e.preventDefault();
            var rect   = container.getBoundingClientRect();
            var mouseX = e.clientX - rect.left - state.tx;
            var mouseY = e.clientY - rect.top  - state.ty;
            var delta  = e.deltaY > 0 ? 0.9 : 1.1;
            var next   = Math.min(Math.max(state.scale * delta, 0.1), 10);
            // zoom toward cursor position
            state.tx  -= mouseX * (next - state.scale);
            state.ty  -= mouseY * (next - state.scale);
            state.scale = next;
            applyTransform();
        }, { passive: false });

        svgEl.addEventListener('mousedown', function (e) {
            state.dragging = true;
            state.startX   = e.clientX - state.tx;
            state.startY   = e.clientY - state.ty;
            svgEl.style.cursor = 'grabbing';
            e.preventDefault();
        });
        document.addEventListener('mousemove', function (e) {
            if (!state.dragging) return;
            state.tx = e.clientX - state.startX;
            state.ty = e.clientY - state.startY;
            applyTransform();
        });
        document.addEventListener('mouseup', function () {
            if (state.dragging) { state.dragging = false; svgEl.style.cursor = 'grab'; }
        });

        // Touch pan
        var lastTouch = null;
        svgEl.addEventListener('touchstart', function (e) {
            if (e.touches.length === 1) { lastTouch = e.touches[0]; e.preventDefault(); }
        }, { passive: false });
        svgEl.addEventListener('touchmove', function (e) {
            if (e.touches.length === 1 && lastTouch) {
                var t = e.touches[0];
                state.tx += t.clientX - lastTouch.clientX;
                state.ty += t.clientY - lastTouch.clientY;
                lastTouch  = t;
                applyTransform();
                e.preventDefault();
            }
        }, { passive: false });
        svgEl.addEventListener('touchend', function () { lastTouch = null; });

        buildControls(diagramId, svgEl, container, state, applyTransform);
    }

    function buildControls(diagramId, svgEl, container, state, applyTransform) {
        var bar = document.createElement('div');
        bar.className = 'mermaid-controls';
        bar.style.cssText =
            'display:flex;gap:4px;margin-bottom:6px;flex-wrap:wrap;align-items:center;' +
            'background:#f4f5f7;border:1px solid #dfe1e6;border-radius:3px;padding:4px 8px;';

        function btn(label, title, onClick) {
            var b = document.createElement('button');
            b.className = 'aui-button aui-button-subtle';
            b.style.cssText = 'font-size:12px;padding:2px 8px;min-width:0;height:24px;line-height:24px;';
            b.textContent = label;
            b.title       = title;
            b.type        = 'button';
            b.addEventListener('click', onClick);
            return b;
        }

        bar.appendChild(btn('＋', 'Zoom in', function () {
            state.scale = Math.min(state.scale * 1.25, 10);
            applyTransform();
        }));
        bar.appendChild(btn('－', 'Zoom out', function () {
            state.scale = Math.max(state.scale * 0.8, 0.1);
            applyTransform();
        }));
        bar.appendChild(btn('⊡ Reset', 'Reset zoom and position', function () {
            state.scale = 1; state.tx = 0; state.ty = 0;
            applyTransform();
        }));
        bar.appendChild(btn('⛶ Fit', 'Fit diagram to container width', function () {
            fitToContainer(svgEl, container, state, applyTransform);
        }));
        bar.appendChild(btn('⛶ Fullscreen', 'View fullscreen', function () {
            openFullscreen(svgEl);
        }));

        // Insert controls BEFORE the output div
        container.parentNode.insertBefore(bar, container);
    }

    function fitToContainer(svgEl, container, state, applyTransform) {
        // Read natural SVG dimensions from viewBox
        var vb = svgEl.getAttribute('viewBox');
        var naturalW = svgEl.scrollWidth;
        if (vb) {
            var parts = vb.split(/[\s,]+/);
            if (parts.length >= 4) naturalW = parseFloat(parts[2]) || naturalW;
        }
        var containerW = container.offsetWidth || container.parentElement.offsetWidth || 800;
        state.scale    = containerW / naturalW;
        state.tx       = 0;
        state.ty       = 0;
        applyTransform();
    }

    function openFullscreen(svgEl) {
        var overlay = document.createElement('div');
        overlay.style.cssText =
            'position:fixed;top:0;left:0;width:100vw;height:100vh;' +
            'background:rgba(9,30,66,0.9);z-index:99999;overflow:auto;' +
            'display:flex;flex-direction:column;align-items:center;justify-content:flex-start;' +
            'padding:40px 24px 24px;box-sizing:border-box;';

        var closeBtn = document.createElement('button');
        closeBtn.textContent = '✕  Close';
        closeBtn.className   = 'aui-button';
        closeBtn.style.cssText = 'position:fixed;top:12px;right:20px;z-index:100000;';
        closeBtn.addEventListener('click', function () { document.body.removeChild(overlay); });

        var clone = svgEl.cloneNode(true);
        clone.removeAttribute('style');
        clone.style.cssText =
            'background:#fff;padding:24px;border-radius:4px;' +
            'max-width:100%;width:auto;height:auto;';
        clone.removeAttribute('width');
        clone.removeAttribute('height');

        overlay.appendChild(closeBtn);
        overlay.appendChild(clone);
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) document.body.removeChild(overlay);
        });
        document.addEventListener('keydown', function esc(e) {
            if (e.key === 'Escape') { document.body.removeChild(overlay); document.removeEventListener('keydown', esc); }
        });
        document.body.appendChild(overlay);
    }

    // ------------------------------------------------------------------
    // Core rendering
    // ------------------------------------------------------------------

    function renderDiagram(diagramId) {
        var srcEl     = document.getElementById(diagramId + '-source');
        var outputEl  = document.getElementById(diagramId + '-output');
        var loadingEl = document.getElementById(diagramId + '-loading');
        var errorEl   = document.getElementById(diagramId + '-error');
        var errorMsg  = document.getElementById(diagramId + '-error-msg');
        var toolbarEl = document.getElementById(diagramId + '-toolbar');

        if (!srcEl || !outputEl) return;

        var source  = decodeEntities(srcEl.textContent || srcEl.innerText || '');
        var theme   = srcEl.getAttribute('data-theme') || 'default';
        var allowDl = srcEl.getAttribute('data-allow-download') === 'true';

        if (!source.trim()) { hide(loadingEl); return; }

        try {
            mermaid.initialize({
                startOnLoad:   false,
                theme:         theme,
                securityLevel: 'loose',
                fontFamily:    'inherit',
                logLevel:      'error',
                // Disable maxWidth so SVG expands to natural size — we control
                // layout ourselves via CSS and the pan/zoom controls.
                flowchart: { useMaxWidth: false, htmlLabels: true },
                sequence:  { useMaxWidth: false, width: 200 },
                gantt:     { useMaxWidth: false },
                er:        { useMaxWidth: false },
                journey:   { useMaxWidth: false },
                pie:       { useMaxWidth: false }
            });
        } catch (e) { /* already initialised */ }

        var svgId = diagramId + '-svg';

        function onSuccess(svgCode) {
            outputEl.innerHTML = svgCode;
            hide(loadingEl);

            var svgEl = outputEl.querySelector('svg');
            if (svgEl) {
                // Strip fixed dimensions — let the container drive sizing
                svgEl.removeAttribute('width');
                svgEl.removeAttribute('height');
                svgEl.style.width  = '80%';
                svgEl.style.height = 'auto';

                // Preserve aspect ratio via viewBox if missing
                if (!svgEl.getAttribute('viewBox')) {
                    var w = svgEl.scrollWidth, h = svgEl.scrollHeight;
                    if (w && h) svgEl.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
                }

                initPanZoom(diagramId, svgEl, outputEl);

                // Auto-fit to full content width on first render
                var state = panZoomState[diagramId];
                if (state) {
                    // Small delay to let the SVG paint and measure correctly
                    setTimeout(function () {
                        var vb = svgEl.getAttribute('viewBox');
                        var naturalW = svgEl.scrollWidth;
                        if (vb) {
                            var parts = vb.split(/[\s,]+/);
                            if (parts.length >= 4) naturalW = parseFloat(parts[2]) || naturalW;
                        }
                        var containerW = outputEl.offsetWidth ||
                            outputEl.parentElement.offsetWidth || 800;
                        if (naturalW > containerW) {
                            state.scale = containerW / naturalW;
                            svgEl.style.transform =
                                'translate(0px,0px) scale(' + state.scale + ')';
                            svgEl.style.transformOrigin = '0 0';
                            // Resize container height to match scaled SVG
                            var vbH = vb ? parseFloat(vb.split(/[\s,]+/)[3]) : svgEl.scrollHeight;
                            if (vbH) outputEl.style.height = (vbH * state.scale + 16) + 'px';
                        }
                    }, 50);
                }
            }
            if (allowDl && toolbarEl) show(toolbarEl);
        }

        function onError(err) {
            hide(loadingEl);
            show(errorEl);
            if (errorMsg) errorMsg.textContent = (err.message || String(err)).substring(0, 500);
        }

        try {
            var result = mermaid.render(svgId, source);
            if (result && typeof result.then === 'function') {
                result.then(function (res) { onSuccess(res.svg || res); }).catch(onError);
            } else {
                mermaid.render(svgId, source, function (svgCode, bindFns) {
                    onSuccess(svgCode);
                    if (typeof bindFns === 'function') bindFns(outputEl);
                });
            }
        } catch (err) { onError(err); }
    }

    function renderAll() {
        var containers = document.querySelectorAll('.mermaid-macro-container');
        for (var i = 0; i < containers.length; i++) {
            var id = containers[i].getAttribute('data-diagram-id');
            if (id) renderDiagram(id);
        }
    }

    // ------------------------------------------------------------------
    // Download
    // ------------------------------------------------------------------

    document.addEventListener('click', function (e) {
        var btn = e.target;
        while (btn && !btn.classList.contains('mermaid-download-btn')) btn = btn.parentElement;
        if (!btn) return;
        var outputEl = document.getElementById(btn.getAttribute('data-target') + '-output');
        if (!outputEl) return;
        var svgEl = outputEl.querySelector('svg');
        if (!svgEl) return;
        var blob = new Blob([new XMLSerializer().serializeToString(svgEl)],
            { type: 'image/svg+xml;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = 'mermaid-diagram.svg';
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
    });

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    function hide(el) { if (el) el.style.display = 'none'; }
    function show(el) { if (el) el.style.display = ''; }

    function decodeEntities(str) {
        var t = document.createElement('textarea');
        t.innerHTML = str;
        return t.value;
    }

    // ------------------------------------------------------------------
    // Boot
    // ------------------------------------------------------------------

    function boot() {
        if (typeof mermaid === 'undefined') {
            console.warn('[MermaidPlugin] mermaid.min.js not loaded.');
            return;
        }
        renderAll();
    }

    if (global.AJS && typeof global.AJS.toInit === 'function') {
        global.AJS.toInit(boot);
    } else if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

}(window));