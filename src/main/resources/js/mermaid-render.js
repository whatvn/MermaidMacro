/**
 * mermaid-render.js
 *
 * Two rendering modes:
 *
 * 1. AUTO-DETECT: Scans every <code> / <pre> block on the page.
 *    If the text starts with a known Mermaid diagram keyword it is
 *    replaced in-place with an interactive SVG.  If mermaid throws a
 *    parse error the original code block is left untouched.
 *
 * 2. EXPLICIT MACRO: Any .mermaid-macro-container element injected by
 *    MermaidMacro.java is also rendered (existing behaviour).
 */
(function (global) {
    'use strict';

    // ------------------------------------------------------------------
    // Mermaid diagram type keywords (first non-whitespace token in source)
    // ------------------------------------------------------------------
    var MERMAID_KEYWORDS = [
        'graph', 'flowchart', 'sequenceDiagram', 'classDiagram',
        'stateDiagram', 'stateDiagram-v2', 'erDiagram', 'gantt',
        'pie', 'journey', 'gitGraph', 'gitgraph', 'mindmap',
        'timeline', 'quadrantChart', 'xychart-beta', 'block-beta',
        'architecture-beta', 'requirementDiagram', 'C4Context',
        'C4Container', 'C4Component', 'C4Dynamic', 'C4Deployment'
    ];

    /**
     * Returns true if the text looks like a Mermaid diagram.
     * Checks the first meaningful token against the known keyword list.
     */
    function isMermaid(text) {
        var trimmed = text.trim();
        // Accept optional %%{init: ...}%% front-matter
        if (trimmed.startsWith('%%')) {
            var after = trimmed.indexOf('\n');
            if (after !== -1) trimmed = trimmed.slice(after + 1).trim();
        }
        var firstToken = trimmed.split(/[\s:{(]/)[0].toLowerCase();
        for (var i = 0; i < MERMAID_KEYWORDS.length; i++) {
            if (firstToken === MERMAID_KEYWORDS[i].toLowerCase()) return true;
        }
        return false;
    }

    // ------------------------------------------------------------------
    // Pan / zoom (shared between auto-detect and macro rendering)
    // ------------------------------------------------------------------

    function initPanZoom(diagramId, svgEl, container) {
        var s = { scale: 1, tx: 0, ty: 0, dragging: false, sx: 0, sy: 0 };

        svgEl.style.cursor        = 'grab';
        svgEl.style.userSelect    = 'none';
        svgEl.style.display       = 'block';
        svgEl.style.transformOrigin = '0 0';

        function apply() {
            svgEl.style.transform =
                'translate(' + s.tx + 'px,' + s.ty + 'px) scale(' + s.scale + ')';
        }

        container.addEventListener('wheel', function (e) {
            e.preventDefault();
            var r  = container.getBoundingClientRect();
            var mx = e.clientX - r.left - s.tx;
            var my = e.clientY - r.top  - s.ty;
            var d  = e.deltaY > 0 ? 0.9 : 1.1;
            var n  = Math.min(Math.max(s.scale * d, 0.1), 10);
            s.tx  -= mx * (n - s.scale);
            s.ty  -= my * (n - s.scale);
            s.scale = n;
            apply();
        }, { passive: false });

        svgEl.addEventListener('mousedown', function (e) {
            s.dragging = true; s.sx = e.clientX - s.tx; s.sy = e.clientY - s.ty;
            svgEl.style.cursor = 'grabbing'; e.preventDefault();
        });
        document.addEventListener('mousemove', function (e) {
            if (!s.dragging) return;
            s.tx = e.clientX - s.sx; s.ty = e.clientY - s.sy; apply();
        });
        document.addEventListener('mouseup', function () {
            if (s.dragging) { s.dragging = false; svgEl.style.cursor = 'grab'; }
        });

        var lt = null;
        svgEl.addEventListener('touchstart',  function (e) { if (e.touches.length === 1) { lt = e.touches[0]; e.preventDefault(); } }, { passive: false });
        svgEl.addEventListener('touchmove',   function (e) { if (e.touches.length === 1 && lt) { var t = e.touches[0]; s.tx += t.clientX - lt.clientX; s.ty += t.clientY - lt.clientY; lt = t; apply(); e.preventDefault(); } }, { passive: false });
        svgEl.addEventListener('touchend',    function () { lt = null; });

        buildControls(svgEl, container, s, apply);
    }

    function buildControls(svgEl, container, s, apply) {
        var bar = document.createElement('div');
        bar.style.cssText =
            'display:flex;gap:4px;flex-wrap:wrap;align-items:center;' +
            'background:#f4f5f7;border:1px solid #dfe1e6;' +
            'border-radius:3px 3px 0 0;padding:4px 8px;box-sizing:border-box;width:100%;';

        function btn(label, title, fn) {
            var b = document.createElement('button');
            b.className = 'aui-button aui-button-subtle';
            b.style.cssText = 'font-size:12px;padding:2px 8px;min-width:0;height:24px;';
            b.textContent = label; b.title = title; b.type = 'button';
            b.addEventListener('click', fn);
            return b;
        }

        bar.appendChild(btn('＋', 'Zoom in',  function () { s.scale = Math.min(s.scale * 1.25, 10); apply(); }));
        bar.appendChild(btn('－', 'Zoom out', function () { s.scale = Math.max(s.scale * 0.8, 0.1); apply(); }));
        bar.appendChild(btn('⊡ Reset', 'Reset', function () { s.scale = 1; s.tx = 0; s.ty = 0; apply(); }));
        bar.appendChild(btn('⛶ Fit', 'Fit to width', function () {
            var vb = svgEl.getAttribute('viewBox');
            var nw = svgEl.scrollWidth;
            if (vb) { var p = vb.split(/[\s,]+/); if (p.length >= 4) nw = parseFloat(p[2]) || nw; }
            var cw = container.offsetWidth || 800;
            s.scale = cw / nw; s.tx = 0; s.ty = 0; apply();
        }));
        bar.appendChild(btn('⛶ Fullscreen', 'Fullscreen', function () { openFullscreen(svgEl); }));

        container.parentNode.insertBefore(bar, container);
    }

    function openFullscreen(svgEl) {
        var ov = document.createElement('div');
        ov.style.cssText =
            'position:fixed;top:0;left:0;width:100vw;height:100vh;' +
            'background:rgba(9,30,66,0.9);z-index:99999;overflow:auto;' +
            'display:flex;align-items:flex-start;justify-content:center;' +
            'padding:40px 24px 24px;box-sizing:border-box;';
        var close = document.createElement('button');
        close.textContent = '✕ Close'; close.className = 'aui-button';
        close.style.cssText = 'position:fixed;top:12px;right:20px;z-index:100000;';
        close.addEventListener('click', function () { document.body.removeChild(ov); });
        var clone = svgEl.cloneNode(true);
        clone.removeAttribute('style');
        clone.style.cssText = 'background:#fff;padding:24px;border-radius:4px;max-width:100%;';
        clone.removeAttribute('width'); clone.removeAttribute('height');
        ov.appendChild(close); ov.appendChild(clone);
        ov.addEventListener('click', function (e) { if (e.target === ov) document.body.removeChild(ov); });
        document.addEventListener('keydown', function esc(e) {
            if (e.key === 'Escape' && document.body.contains(ov)) {
                document.body.removeChild(ov);
                document.removeEventListener('keydown', esc);
            }
        });
        document.body.appendChild(ov);
    }

    // ------------------------------------------------------------------
    // Pre-processing: escape problematic characters per diagram type
    // ------------------------------------------------------------------

    /**
     * Detects the diagram type from the first keyword in the source.
     */
    function detectDiagramType(source) {
        var trimmed = source.trim();
        // Skip optional %%{init}%% front-matter
        if (trimmed.indexOf('%%') === 0) {
            var nl = trimmed.indexOf('\n');
            if (nl !== -1) trimmed = trimmed.slice(nl + 1).trim();
        }
        return trimmed.split(/[\s:{(]/)[0].toLowerCase();
    }

    /**
     * Wraps a string in double quotes if it contains parens and is not
     * already quoted. Escapes any existing double quotes inside.
     */
    function quoteIfNeeded(str) {
        if (!str) return str;
        var s = str.trim();
        // Already quoted with double or single quotes → leave alone
        if ((s[0] === '"' && s[s.length - 1] === '"') ||
            (s[0] === "'" && s[s.length - 1] === "'")) return s;
        // Contains parens or colons that would confuse mermaid's parser
        if (/[():]/.test(s)) {
            return '"' + s.replace(/"/g, "'") + '"';
        }
        return s;
    }

    /**
     * Fixes a single sequence diagram line.
     *
     * Handles:
     *   participant Name (with parens)
     *   participant Name (with parens) as Alias (with parens)
     *   actor Name (with parens)
     *   Source (name)->>/-->>/etc Target (name): label
     */
    function fixSequenceLine(line) {
        var trimmed = line.trimLeft();
        var indent  = line.slice(0, line.length - trimmed.length);

        // ── participant / actor declaration ───────────────────────────
        var partMatch = trimmed.match(/^(participant|actor)\s+([\s\S]+?)(?:\s+as\s+([\s\S]+))?\s*$/i);
        if (partMatch) {
            var kw    = partMatch[1];
            var name  = quoteIfNeeded(partMatch[2].trim());
            var alias = partMatch[3] ? (' as ' + quoteIfNeeded(partMatch[3].trim())) : '';
            return indent + kw + ' ' + name + alias;
        }

        // ── arrow lines: Src ->>/->/-->> etc Dst: label ───────────────
        // Mermaid sequence arrow pattern:
        //   <participant> <arrow> <participant> : <message>
        // where participant can have spaces/parens
        // Arrows: ->>, ->>, -->>, -->, -x, -), ->>, -\, -/
        var arrowRe = /^([\s\S]+?)\s*(-->>|--x|--\)|-->|->|-)?\s*(->>|-x|-\)|->)\s*([\s\S]+?)\s*:\s*([\s\S]*)$/;
        var arrMatch = trimmed.match(arrowRe);
        if (arrMatch) {
            var src   = quoteIfNeeded(arrMatch[1].trim());
            var pre   = arrMatch[2] || '';
            var arrow = arrMatch[3];
            var dst   = quoteIfNeeded(arrMatch[4].trim());
            var label = arrMatch[5];
            return indent + src + pre + arrow + dst + ': ' + label;
        }

        return line;
    }

    /**
     * Main pre-processor. Transforms the source before passing to mermaid
     * so that parentheses in names/labels don't break the parser.
     */
    function preprocessSource(source) {
        var type  = detectDiagramType(source);
        var lines = source.split('\n');

        // ── sequenceDiagram ───────────────────────────────────────────
        if (type === 'sequencediagram') {
            return lines.map(function (line) {
                // Skip comment lines and directives
                if (/^\s*%%/.test(line) || /^\s*(?:Note|loop|alt|else|opt|par|and|end|rect|autonumber|activate|deactivate)/i.test(line)) {
                    return line;
                }
                return fixSequenceLine(line);
            }).join('\n');
        }

        // ── flowchart / graph ─────────────────────────────────────────
        // Node labels with parens: A[Queue (Kafka)] → A["Queue (Kafka)"]
        // Also fixes: A(Queue (Kafka)) which mermaid reads as nested
        if (type === 'flowchart' || type === 'graph') {
            return lines.map(function (line) {
                if (/^\s*%%/.test(line)) return line;

                // Replace unquoted bracket labels containing parens
                // Matches: nodeId["label"] nodeId[label] nodeId(label) nodeId{label}
                return line.replace(
                    /(\w[\w-]*)\s*([\[({>])((?:[^"'()\[\]{}]|\\.)*\([^)]*\)(?:[^"'()\[\]{}]|\\.)*)([\])}<!])/g,
                    function (match, id, open, content, close) {
                        // Already safe bracket types that support parens natively
                        // Only fix when content has unquoted parens
                        var quoted = '"' + content.replace(/"/g, "'") + '"';
                        return id + open + quoted + close;
                    }
                );
            }).join('\n');
        }

        // ── classDiagram ──────────────────────────────────────────────
        // Method signatures are intentionally kept — parens are valid here.
        // Only fix class names in relationship lines if they have parens.
        if (type === 'classdiagram') {
            return lines.map(function (line) {
                if (/^\s*%%/.test(line)) return line;
                // Relationship: ClassName <|-- ClassName2
                return line.replace(
                    /^(\s*)([\w()[\] ]+?)\s*([<|*o.]{0,3}[-]+[>|*o.]{0,3}|\.{2}[>|]?)\s*([\w()[\] ]+?)\s*(?::\s*(.*))?$/,
                    function (_, ind, left, rel, right, label) {
                        return ind + quoteIfNeeded(left.trim()) + ' ' + rel + ' ' +
                            quoteIfNeeded(right.trim()) + (label ? ' : ' + label : '');
                    }
                );
            }).join('\n');
        }

        // All other diagram types — return as-is
        return source;
    }

    // ------------------------------------------------------------------
    // Core SVG injection (used by both modes)
    // ------------------------------------------------------------------

    var counter = 0;

    function renderSource(source, theme, outputEl, onDone, onError) {
        // Pre-process before handing to mermaid
        source = preprocessSource(source);
        var svgId = 'mermaid-auto-svg-' + (++counter);

        try {
            mermaid.initialize({
                startOnLoad:   false,
                theme:         theme || 'default',
                securityLevel: 'loose',
                fontFamily:    'inherit',
                logLevel:      'error',
                flowchart: { useMaxWidth: false, htmlLabels: true },
                sequence:  { useMaxWidth: false },
                gantt:     { useMaxWidth: false },
                er:        { useMaxWidth: false },
                pie:       { useMaxWidth: false }
            });
        } catch (e) { /* already initialised */ }

        function success(svgCode) {
            outputEl.innerHTML = svgCode;
            var svgEl = outputEl.querySelector('svg');
            if (svgEl) {
                svgEl.removeAttribute('width');
                svgEl.removeAttribute('height');
                svgEl.style.width  = '100%';
                svgEl.style.height = 'auto';
                if (!svgEl.getAttribute('viewBox')) {
                    var w = svgEl.scrollWidth, h = svgEl.scrollHeight;
                    if (w && h) svgEl.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
                }
                initPanZoom('auto-' + counter, svgEl, outputEl);
                // Auto-fit on first paint
                setTimeout(function () {
                    var vb = svgEl.getAttribute('viewBox');
                    var nw = svgEl.scrollWidth;
                    if (vb) { var p = vb.split(/[\s,]+/); if (p.length >= 4) nw = parseFloat(p[2]) || nw; }
                    var cw = outputEl.offsetWidth || outputEl.parentElement.offsetWidth || 800;
                    if (nw > cw) {
                        var sc = cw / nw;
                        svgEl.style.transform = 'translate(0,0) scale(' + sc + ')';
                        svgEl.style.transformOrigin = '0 0';
                        var vbH = vb ? parseFloat(vb.split(/[\s,]+/)[3]) : svgEl.scrollHeight;
                        if (vbH) outputEl.style.height = (vbH * sc + 16) + 'px';
                    }
                }, 50);
            }
            if (onDone) onDone(svgEl);
        }

        try {
            var result = mermaid.render(svgId, source);
            if (result && typeof result.then === 'function') {
                result.then(function (r) { success(r.svg || r); }).catch(onError || function () {});
            } else {
                mermaid.render(svgId, source, function (svg, bind) {
                    success(svg);
                    if (typeof bind === 'function') bind(outputEl);
                });
            }
        } catch (e) { if (onError) onError(e); }
    }

    // ------------------------------------------------------------------
    // MODE 1: Auto-detect — all Confluence text/code block types
    // ------------------------------------------------------------------

    /**
     * Confluence 7 Server/DC renders text blocks as follows:
     *
     * ┌─ Code Block macro ──────────────────────────────────────────────┐
     * │  <div class="code panel pdl">                                   │
     * │    <div class="codeContent pdl">                                │
     * │      <pre class="code-java"> / <pre class="code-none"> etc.    │
     * │    </div>                                                       │
     * │  </div>                                                         │
     * └─────────────────────────────────────────────────────────────────┘
     *
     * ┌─ Noformat macro ────────────────────────────────────────────────┐
     * │  <div class="preformatted panel pdl">                           │
     * │    <div class="preformattedContent pdl">                        │
     * │      <pre class="preformatted-content">                        │
     * │    </div>                                                       │
     * │  </div>                                                         │
     * └─────────────────────────────────────────────────────────────────┘
     *
     * ┌─ Preformatted paragraph style (Ctrl+7) ────────────────────────┐
     * │  <p class="preformatted">text here</p>                         │
     * │  or: <p style="...font-family:monospace...">text here</p>      │
     * └─────────────────────────────────────────────────────────────────┘
     *
     * ┌─ Monospace inline (toolbar button) ────────────────────────────┐
     * │  <code>text</code>  (standalone block-level use)               │
     * └─────────────────────────────────────────────────────────────────┘
     *
     * ┌─ Generic / third-party editors ────────────────────────────────┐
     * │  <pre>...</pre>                                                 │
     * │  <pre><code>...</code></pre>                                    │
     * │  <code class="language-mermaid">...</code>                     │
     * └─────────────────────────────────────────────────────────────────┘
     */
    function autoDetect() {
        var candidates = [];

        function add(nodeList) {
            for (var i = 0; i < nodeList.length; i++) {
                if (candidates.indexOf(nodeList[i]) === -1) candidates.push(nodeList[i]);
            }
        }

        // 1. Code Block macro — target the <pre> inside .codeContent
        add(document.querySelectorAll('.codeContent pre, .codeContent.pdl pre'));

        // 2. Noformat macro — target the <pre> inside .preformattedContent
        add(document.querySelectorAll('.preformattedContent pre, .preformattedContent.pdl pre'));

        // 3. Preformatted paragraph style (Ctrl+7)
        //    Confluence renders this as <p class="preformatted"> or with a
        //    monospace style attribute. We read the whole <p> as one block.
        add(document.querySelectorAll('p.preformatted, p[class*="preformatted"]'));

        // 4. Any bare <pre> not already captured above
        add(document.querySelectorAll('pre'));

        // 5. Explicit language-mermaid <code> blocks, including inside
        //    <pre data-bidi-marker="true"> which Confluence's bidi renderer wraps
        add(document.querySelectorAll(
            'code.language-mermaid, code[class*="mermaid"], code[data-lang="mermaid"]'
        ));

        // 6. <pre data-bidi-marker> wrapping a <code class="language-mermaid">
        //    Confluence's bidi text processor wraps code blocks this way
        add(document.querySelectorAll(
            'pre[data-bidi-marker] code.language-mermaid,' +
            'pre[data-bidi-marker] code[class*="mermaid"]'
        ));

        // 6. Multi-line <code> blocks that aren't inline (heuristic: contains newlines)
        //    Covers monospace paragraphs pasted as <code> blocks
        var allCode = document.querySelectorAll('code');
        for (var c = 0; c < allCode.length; c++) {
            var txt = allCode[c].textContent || '';
            if (txt.indexOf('\n') !== -1 && candidates.indexOf(allCode[c]) === -1) {
                candidates.push(allCode[c]);
            }
        }

        candidates.forEach(function (el) {
            if (el.getAttribute('data-mermaid-processed')) return;
            if (closest(el, '.mermaid-macro-container')) return;
            // Skip elements that are inside already-processed wrappers
            if (closest(el, '.mermaid-auto-container')) return;

            var source = decodeEntities(el.textContent || el.innerText || '');
            if (!isMermaid(source)) return;

            el.setAttribute('data-mermaid-processed', 'true');

            // For preformatted <p> blocks, replace the whole <p>.
            // For code panels, replace the outermost panel <div> so the
            // Confluence chrome (title bar etc.) disappears cleanly.
            var target = el;
            var panel  = closest(el, '.code.panel, .preformatted.panel, [class*="pdl"]');
            if (panel && !closest(panel, '.mermaid-auto-container')) {
                target = panel;
            }

            replaceWithDiagram(target, source.trim());
        });
    }

    function replaceWithDiagram(originalEl, source) {
        // Build wrapper to replace the code block
        var wrapper = document.createElement('div');
        wrapper.className = 'mermaid-auto-container';
        wrapper.style.cssText = 'margin:12px 0;width:100%;box-sizing:border-box;';

        var outputEl = document.createElement('div');
        outputEl.className = 'mermaid-macro-output';
        outputEl.style.cssText =
            'width:100%;box-sizing:border-box;overflow:hidden;position:relative;' +
            'border:1px solid #dfe1e6;border-top:none;border-radius:0 0 3px 3px;' +
            'background:#fff;padding:16px;min-height:40px;';

        var loadingEl = document.createElement('div');
        loadingEl.style.cssText = 'color:#6b778c;font-style:italic;font-size:13px;';
        loadingEl.textContent   = 'Rendering diagram…';

        outputEl.appendChild(loadingEl);
        wrapper.appendChild(outputEl);

        // Insert wrapper before the original element, then hide original
        originalEl.parentNode.insertBefore(wrapper, originalEl);
        originalEl.style.display = 'none';

        renderSource(
            source,
            'default',
            outputEl,
            function () { loadingEl.remove(); },  // success
            function (err) {                       // error — restore original
                console.warn('[MermaidPlugin] Auto-render failed, showing original:', err.message || err);
                wrapper.remove();
                originalEl.style.display = '';     // show text as-is
            }
        );
    }

    // ------------------------------------------------------------------
    // MODE 2: Explicit macro containers (MermaidMacro.java output)
    // ------------------------------------------------------------------

    function renderMacroContainers() {
        var containers = document.querySelectorAll('.mermaid-macro-container');
        for (var i = 0; i < containers.length; i++) {
            var id = containers[i].getAttribute('data-diagram-id');
            if (id) renderMacroInstance(id);
        }
    }

    function renderMacroInstance(diagramId) {
        var srcEl     = document.getElementById(diagramId + '-source');
        var outputEl  = document.getElementById(diagramId + '-output');
        var loadingEl = document.getElementById(diagramId + '-loading');
        var errorEl   = document.getElementById(diagramId + '-error');
        var errorMsg  = document.getElementById(diagramId + '-error-msg');
        var toolbarEl = document.getElementById(diagramId + '-toolbar');

        if (!srcEl || !outputEl) return;
        var source = decodeEntities(srcEl.textContent || srcEl.innerText || '');
        var theme  = srcEl.getAttribute('data-theme') || 'default';
        var allowDl = srcEl.getAttribute('data-allow-download') === 'true';
        if (!source.trim()) { if (loadingEl) loadingEl.style.display = 'none'; return; }

        renderSource(
            source, theme, outputEl,
            function () {
                if (loadingEl) loadingEl.style.display = 'none';
                if (allowDl && toolbarEl) toolbarEl.style.display = '';
            },
            function (err) {
                if (loadingEl) loadingEl.style.display = 'none';
                if (errorEl)   errorEl.style.display   = '';
                if (errorMsg)  errorMsg.textContent     = (err.message || String(err)).substring(0, 500);
            }
        );
    }

    // ------------------------------------------------------------------
    // Download
    // ------------------------------------------------------------------

    document.addEventListener('click', function (e) {
        var btn = e.target;
        while (btn && !btn.classList.contains('mermaid-download-btn')) btn = btn.parentElement;
        if (!btn) return;
        var out = document.getElementById(btn.getAttribute('data-target') + '-output');
        if (!out) return;
        var svg = out.querySelector('svg');
        if (!svg) return;
        var blob = new Blob([new XMLSerializer().serializeToString(svg)],
            { type: 'image/svg+xml;charset=utf-8' });
        var url  = URL.createObjectURL(blob);
        var a    = document.createElement('a');
        a.href   = url; a.download = 'mermaid-diagram.svg';
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
    });

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    /**
     * Decodes HTML entities in a string.
     * Runs up to 3 passes to handle double-escaped content like &amp;amp;gt;
     * which Confluence's bidi/storage renderer sometimes produces.
     * e.g.  &amp;gt;  →  &gt;  →  >
     *        --&amp;gt;  →  --&gt;  →  -->
     */
    function decodeEntities(str) {
        var t = document.createElement('textarea');
        var prev = str;
        for (var i = 0; i < 3; i++) {
            t.innerHTML = prev;
            var decoded = t.value;
            // Stop as soon as decoding is stable (no more entities to expand)
            if (decoded === prev) break;
            prev = decoded;
        }
        return prev;
    }

    // Polyfill for Element.closest (IE11 / old Confluence themes)
    function closest(el, sel) {
        while (el) {
            if (el.matches && el.matches(sel)) return el;
            el = el.parentElement;
        }
        return null;
    }

    // ------------------------------------------------------------------
    // Boot
    // ------------------------------------------------------------------

    function boot() {
        if (typeof mermaid === 'undefined') {
            console.warn('[MermaidPlugin] mermaid.min.js not loaded.');
            return;
        }
        renderMacroContainers();  // explicit macros
        autoDetect();             // implicit code blocks
    }

    if (global.AJS && typeof global.AJS.toInit === 'function') {
        global.AJS.toInit(boot);
    } else if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

}(window));