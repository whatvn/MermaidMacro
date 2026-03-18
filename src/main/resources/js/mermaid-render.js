(function (global) {
    'use strict';

    // ------------------------------------------------------------------
    // Mermaid diagram type keywords
    // ------------------------------------------------------------------
    var MERMAID_KEYWORDS = [
        'graph', 'flowchart', 'sequenceDiagram', 'classDiagram',
        'stateDiagram', 'stateDiagram-v2', 'erDiagram', 'gantt',
        'pie', 'journey', 'gitGraph', 'gitgraph', 'mindmap',
        'timeline', 'quadrantChart', 'xychart-beta', 'block-beta',
        'architecture-beta', 'requirementDiagram', 'C4Context',
        'C4Container', 'C4Component', 'C4Dynamic', 'C4Deployment'
    ];

    // ------------------------------------------------------------------
    // Step 1: Decode HTML entities (multi-pass, idempotent)
    // ------------------------------------------------------------------
    function decodeEntities(str) {
        var t = document.createElement('textarea');
        var prev = str;
        for (var i = 0; i < 3; i++) {
            t.innerHTML = prev;
            var next = t.value;
            if (next === prev) break;
            prev = next;
        }
        return prev;
    }

    // ------------------------------------------------------------------
    // Step 2: Strip Markdown fenced code block markers
    // ------------------------------------------------------------------
    function stripFence(text) {
        var trimmed = text.trim();
        var m = trimmed.match(/^(`{3,}|~{3,})(mermaid)?\s*\n([\s\S]*?)(\n`{3,}|\n~{3,})\s*$/i);
        return m ? m[3].trim() : trimmed;
    }

    // ------------------------------------------------------------------
    // Step 3: Detect diagram type from first keyword
    // ------------------------------------------------------------------
    function detectDiagramType(source) {
        var trimmed = source.trim();
        if (trimmed.indexOf('%%') === 0) {
            var nl = trimmed.indexOf('\n');
            if (nl !== -1) trimmed = trimmed.slice(nl + 1).trim();
        }
        return trimmed.split(/[\s:{(]/)[0].toLowerCase();
    }

    // ------------------------------------------------------------------
    // Step 4: isMermaid check (on already-decoded, fence-stripped source)
    // ------------------------------------------------------------------
    function isMermaid(source) {
        var type = detectDiagramType(source);
        for (var i = 0; i < MERMAID_KEYWORDS.length; i++) {
            if (type === MERMAID_KEYWORDS[i].toLowerCase()) return true;
        }
        return false;
    }

    // ------------------------------------------------------------------
    // Step 5a: Escape helpers
    // ------------------------------------------------------------------

    // Escape < > but skip already-escaped &lt; &gt;
    function escSafe(s) {
        return s.replace(/&lt;|&gt;|<|>/g, function (m) {
            return (m === '&lt;' || m === '&gt;') ? m : (m === '<' ? '&lt;' : '&gt;');
        });
    }

    // Escape bare & but skip already-escaped entities
    function escAmpSafe(s) {
        return s.replace(/&(?![a-zA-Z]{2,6};|#\d{1,6};|#x[0-9a-fA-F]{1,6};)/g, '&amp;');
    }

    /**
     * Find the index of the matching closing paren, accounting for nesting.
     * e.g. for "getApp(GetAppRequest) : GetAppResponse)" starting at 0
     *   depth tracks ( and ) — returns index of the outermost )
     */
    function findMatchingClose(str, openIdx) {
        var depth = 0;
        for (var i = openIdx; i < str.length; i++) {
            if (str[i] === '(') depth++;
            else if (str[i] === ')') {
                depth--;
                if (depth === 0) return i;
            }
        }
        return -1; // unbalanced
    }

    /**
     * Extract all top-level parenthesised groups from a string, handling nesting.
     * Returns array of {start, end, inner} where inner is the content between parens.
     */
    function findParenGroups(str) {
        var groups = [];
        var i = 0;
        while (i < str.length) {
            var oi = str.indexOf('(', i);
            if (oi === -1) break;
            var ci = findMatchingClose(str, oi);
            if (ci === -1) break;
            groups.push({ start: oi, end: ci, inner: str.slice(oi + 1, ci) });
            i = ci + 1;
        }
        return groups;
    }

    /**
     * Replace all top-level paren groups in a line, applying escFn to inner content.
     * Handles nested parens correctly — escFn receives the full inner string including
     * any nested parens.
     */
    function replaceParenGroups(line, escFn) {
        var groups = findParenGroups(line);
        if (!groups.length) return line;
        var result = '';
        var prev   = 0;
        for (var i = 0; i < groups.length; i++) {
            var g = groups[i];
            result += line.slice(prev, g.start + 1);  // up to and including '('
            result += escFn(g.inner);
            result += ')';
            prev = g.end + 1;
        }
        result += line.slice(prev);
        return result;
    }

    // ------------------------------------------------------------------
    // Step 5b: Per-line label escaping (nested-paren aware)
    // ------------------------------------------------------------------

    function escapeAnglesInLabels(line) {
        if (/^\s*%%/.test(line)) return line;

        // Inside (...) — handles nested parens like getApp(GetAppRequest):Resp
        line = replaceParenGroups(line, function (inner) {
            return (inner.indexOf('<') === -1 && inner.indexOf('>') === -1)
                ? inner : escSafe(inner);
        });

        // Inside [...] — simple, no nesting expected in bracket labels
        line = line.replace(/\[([^\]]*)\]/g, function (_, inner) {
            return (inner.indexOf('<') === -1 && inner.indexOf('>') === -1)
                ? '[' + inner + ']'
                : '[' + escSafe(inner) + ']';
        });

        // Inside "..."
        line = line.replace(/"([^"]*)"/g, function (_, inner) {
            return (inner.indexOf('<') === -1 && inner.indexOf('>') === -1)
                ? '"' + inner + '"'
                : '"' + escSafe(inner) + '"';
        });

        return line;
    }

    function escapeAmpInLabels(line) {
        if (/^\s*%%/.test(line)) return line;

        line = replaceParenGroups(line, function (inner) {
            return inner.indexOf('&') !== -1 ? escAmpSafe(inner) : inner;
        });
        line = line.replace(/\[([^\]]*)\]/g, function (_, inner) {
            return '[' + (inner.indexOf('&') !== -1 ? escAmpSafe(inner) : inner) + ']';
        });
        line = line.replace(/"([^"]*)"/g, function (_, inner) {
            return '"' + (inner.indexOf('&') !== -1 ? escAmpSafe(inner) : inner) + '"';
        });
        // subgraph unquoted label
        line = line.replace(/^(\s*subgraph\s+)([^"\n].*)$/, function (_, kw, label) {
            return kw + (label.indexOf('&') !== -1 ? escAmpSafe(label) : label);
        });
        return line;
    }

    // Wrap a string in double quotes if it contains parens or colons and is not already quoted
    function quoteIfNeeded(str) {
        if (!str) return str;
        var s = str.trim();
        if ((s[0] === '"' && s[s.length - 1] === '"') ||
            (s[0] === "'" && s[s.length - 1] === "'")) return s;
        if (/[():]/.test(s)) return '"' + s.replace(/"/g, "'") + '"';
        return s;
    }

    // ------------------------------------------------------------------
    // Step 5c: Fix a single sequence diagram line
    // ------------------------------------------------------------------
    function fixSequenceLine(line) {
        var trimmed = line.trimLeft ? line.trimLeft() : line.replace(/^\s+/, '');
        var indent  = line.slice(0, line.length - trimmed.length);

        // participant / actor declaration
        var pm = trimmed.match(/^(participant|actor)\s+([\s\S]+?)(?:\s+as\s+([\s\S]+))?\s*$/i);
        if (pm) {
            var kw    = pm[1];
            var name  = quoteIfNeeded(pm[2].trim());
            var alias = pm[3] ? (' as ' + quoteIfNeeded(pm[3].trim())) : '';
            return indent + kw + ' ' + name + alias;
        }

        // Arrow lines: Src ->>/->/-->> etc Dst: label
        var am = trimmed.match(/^([\s\S]+?)\s*(-->>|--x|--\)|-->|->|-)\s*(->>|-x|-\)|->)\s*([\s\S]+?)\s*:\s*([\s\S]*)$/);
        if (am) {
            return indent +
                quoteIfNeeded(am[1].trim()) +
                (am[2] || '') + am[3] +
                quoteIfNeeded(am[4].trim()) +
                ': ' + am[5];
        }

        return line;
    }

    // ------------------------------------------------------------------
    // Step 5: preprocessSource — called inside renderSource
    // ------------------------------------------------------------------
    function preprocessSource(source) {
        var type  = detectDiagramType(source);
        var lines = source.split('\n');

        if (type === 'sequencediagram') {
            return lines.map(function (line) {
                if (/^\s*%%/.test(line)) return line;
                if (/^\s*(?:Note|loop|alt|else|opt|par|and|end|rect|autonumber|activate|deactivate)/i.test(line)) return line;
                line = fixSequenceLine(line);
                line = escapeAnglesInLabels(line);
                line = escapeAmpInLabels(line);
                return line;
            }).join('\n');
        }

        if (type === 'flowchart' || type === 'graph') {
            return lines.map(function (line) {
                if (/^\s*%%/.test(line)) return line;

                // 1. Quote subgraph labels with parens
                line = line.replace(
                    /^(\s*subgraph\s+)([^"\n]+\([^)\n]*\)[^\n]*)$/,
                    function (_, kw, label) { return kw + '"' + label.trim().replace(/"/g, "'") + '"'; }
                );

                // 2. Node definitions with nested/complex parens:
                //    nodeId(outerLabel(innerLabel) : ReturnType)
                //    → nodeId["outerLabel(innerLabel) : ReturnType"]
                //    Only triggers when the paren group itself contains parens (nested).
                line = line.replace(/^(\s*)([\w][\w-]*)\((.+)\)\s*$/, function (_, indent, id, inner) {
                    // Only rewrite if inner content has nested parens or colons
                    // (simple round nodes like A(label) are valid and must be left alone)
                    if (inner.indexOf('(') !== -1 || inner.indexOf(')') !== -1 || inner.indexOf(':') !== -1) {
                        var safe = inner.replace(/"/g, "'");
                        return indent + id + '["' + safe + '"]';
                    }
                    return _;
                });

                // 3. Quote bracket node labels with parens  A[Queue (Kafka)] → A["Queue (Kafka)"]
                line = line.replace(
                    /(\w[\w-]*)\s*\[([^\]"]*\([^\]]*\)[^\]"]*)\]/g,
                    function (_, id, label) { return id + '["' + label.replace(/"/g, "'") + '"]'; }
                );

                // 4. Escape < > in labels
                line = escapeAnglesInLabels(line);

                // 5. Escape & in labels
                line = escapeAmpInLabels(line);

                return line;
            }).join('\n');
        }

        if (type === 'classdiagram') {
            return lines.map(function (line) {
                if (/^\s*%%/.test(line)) return line;
                line = line.replace(
                    /^(\s*)([\w()[\] ]+?)\s*([<|*o.]{0,3}[-]+[>|*o.]{0,3}|\.{2}[>|]?)\s*([\w()[\] ]+?)\s*(?::\s*(.*))?$/,
                    function (_, ind, left, rel, right, label) {
                        return ind + quoteIfNeeded(left.trim()) + ' ' + rel + ' ' +
                            quoteIfNeeded(right.trim()) + (label ? ' : ' + label : '');
                    }
                );
                line = escapeAnglesInLabels(line);
                return line;
            }).join('\n');
        }

        // All other diagram types
        return lines.map(function (line) {
            line = escapeAnglesInLabels(line);
            line = escapeAmpInLabels(line);
            return line;
        }).join('\n');
    }

    // ------------------------------------------------------------------
    // Pan / zoom
    // ------------------------------------------------------------------
    function initPanZoom(svgEl, container) {
        var s = { scale: 1, tx: 0, ty: 0, dragging: false, sx: 0, sy: 0 };

        svgEl.style.cursor         = 'grab';
        svgEl.style.userSelect     = 'none';
        svgEl.style.display        = 'block';
        svgEl.style.transformOrigin = '0 0';

        function apply() {
            svgEl.style.transform = 'translate(' + s.tx + 'px,' + s.ty + 'px) scale(' + s.scale + ')';
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
            b.addEventListener('click', fn); return b;
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
    // Core: renderSource
    // Pipeline: decodeEntities → stripFence → preprocessSource → mermaid.render
    // ------------------------------------------------------------------
    var counter = 0;

    function renderSource(source, theme, outputEl, onDone, onError) {
        // Full pipeline — safe to call regardless of whether source came from
        // autoDetect (already decoded) or explicit macro (Velocity-escaped)
        // because decodeEntities and stripFence are both idempotent.
        var processed = preprocessSource(stripFence(decodeEntities(source)));

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

        var svgId = 'mermaid-svg-' + (++counter);

        function onSuccess(svgCode) {
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
                initPanZoom(svgEl, outputEl);
                setTimeout(function () {
                    var vb  = svgEl.getAttribute('viewBox');
                    var nw  = svgEl.scrollWidth;
                    if (vb) { var p = vb.split(/[\s,]+/); if (p.length >= 4) nw = parseFloat(p[2]) || nw; }
                    var cw  = outputEl.offsetWidth || (outputEl.parentElement && outputEl.parentElement.offsetWidth) || 800;
                    if (nw > cw) {
                        var sc = cw / nw;
                        svgEl.style.transform       = 'translate(0,0) scale(' + sc + ')';
                        svgEl.style.transformOrigin = '0 0';
                        var vbH = vb ? parseFloat(vb.split(/[\s,]+/)[3]) : svgEl.scrollHeight;
                        if (vbH) outputEl.style.height = (vbH * sc + 16) + 'px';
                    }
                }, 50);
            }
            if (onDone) onDone(svgEl);
        }

        try {
            var result = mermaid.render(svgId, processed);
            if (result && typeof result.then === 'function') {
                result.then(function (r) { onSuccess(r.svg || r); }).catch(onError || function () {});
            } else {
                mermaid.render(svgId, processed, function (svg, bind) {
                    onSuccess(svg);
                    if (typeof bind === 'function') bind(outputEl);
                });
            }
        } catch (e) { if (onError) onError(e); }
    }

    // ------------------------------------------------------------------
    // Replace a DOM element with a rendered diagram wrapper
    // ------------------------------------------------------------------
    function replaceWithDiagram(targetEl, source) {
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
        loadingEl.textContent   = 'Rendering diagram\u2026';

        outputEl.appendChild(loadingEl);
        wrapper.appendChild(outputEl);
        targetEl.parentNode.insertBefore(wrapper, targetEl);
        targetEl.style.display = 'none';

        renderSource(
            source,
            'default',
            outputEl,
            function () { if (loadingEl.parentNode) loadingEl.parentNode.removeChild(loadingEl); },
            function (err) {
                console.warn('[MermaidPlugin] render failed, restoring original:', err && (err.message || err));
                if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
                targetEl.style.display = '';
            }
        );
    }

    // ------------------------------------------------------------------
    // Mode 1: Auto-detect all Confluence code/preformatted block types
    // ------------------------------------------------------------------
    function autoDetect() {
        var candidates = [];
        function add(list) { for (var i = 0; i < list.length; i++) { if (candidates.indexOf(list[i]) === -1) candidates.push(list[i]); } }

        add(document.querySelectorAll('.codeContent pre, .codeContent.pdl pre'));
        add(document.querySelectorAll('.preformattedContent pre, .preformattedContent.pdl pre'));
        add(document.querySelectorAll('p.preformatted, p[class*="preformatted"]'));
        add(document.querySelectorAll('pre'));
        add(document.querySelectorAll('code.language-mermaid, code[class*="mermaid"], code[data-lang="mermaid"]'));
        add(document.querySelectorAll('pre[data-bidi-marker] code.language-mermaid, pre[data-bidi-marker] code[class*="mermaid"]'));

        // Multi-line <code> blocks (monospace paragraphs)
        var allCode = document.querySelectorAll('code');
        for (var c = 0; c < allCode.length; c++) {
            var t = allCode[c].textContent || '';
            if (t.indexOf('\n') !== -1 && candidates.indexOf(allCode[c]) === -1) candidates.push(allCode[c]);
        }

        for (var i = 0; i < candidates.length; i++) {
            var el = candidates[i];
            if (el.getAttribute('data-mermaid-processed')) continue;
            if (closest(el, '.mermaid-macro-container')) continue;
            if (closest(el, '.mermaid-auto-container'))  continue;

            // Decode and strip fence before isMermaid check
            var source = decodeEntities(el.textContent || el.innerText || '');
            source     = stripFence(source);

            if (!isMermaid(source)) continue;

            // Mark before async render so re-runs don't double-process
            el.setAttribute('data-mermaid-processed', 'true');

            // Replace outermost Confluence panel wrapper if present
            var target = el;
            var panel  = closest(el, '.code.panel, .preformatted.panel, [class*="pdl"]');
            if (panel && !closest(panel, '.mermaid-auto-container')) target = panel;

            // Pass already-decoded, fence-stripped source — renderSource will
            // run decodeEntities+stripFence again (idempotent) then preprocessSource
            replaceWithDiagram(target, source);
        }
    }

    // ------------------------------------------------------------------
    // Mode 2: Explicit {mermaid} macro containers
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
        var source  = srcEl.textContent || srcEl.innerText || '';
        var theme   = srcEl.getAttribute('data-theme') || 'default';
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
                if (errorMsg)  errorMsg.textContent     = (err && (err.message || String(err)) || '').substring(0, 500);
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
        var blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml;charset=utf-8' });
        var url  = URL.createObjectURL(blob);
        var a    = document.createElement('a');
        a.href = url; a.download = 'mermaid-diagram.svg';
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
    });

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------
    function closest(el, sel) {
        while (el) { if (el.matches && el.matches(sel)) return el; el = el.parentElement; }
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
        renderMacroContainers();
        autoDetect();
    }

    if (global.AJS && typeof global.AJS.toInit === 'function') {
        global.AJS.toInit(boot);
    } else if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

}(window));