/**
 * mermaid-render.js
 * Loaded on every Confluence page (context: atl.general).
 * Finds all .mermaid-macro-source elements and renders them via mermaid.js.
 *
 * Depends on: mermaid.min.js (bundled in the same web-resource)
 */
(function (global) {
    'use strict';

    // ------------------------------------------------------------------
    // Core rendering
    // ------------------------------------------------------------------

    /**
     * Render a single Mermaid macro instance identified by its diagramId.
     * @param {string} diagramId  - the unique id used as the element prefix
     */
    function renderDiagram(diagramId) {
        var srcEl      = document.getElementById(diagramId + '-source');
        var outputEl   = document.getElementById(diagramId + '-output');
        var loadingEl  = document.getElementById(diagramId + '-loading');
        var errorEl    = document.getElementById(diagramId + '-error');
        var errorMsgEl = document.getElementById(diagramId + '-error-msg');
        var toolbarEl  = document.getElementById(diagramId + '-toolbar');

        if (!srcEl || !outputEl) return;

        // Decode HTML entities back to plain text Mermaid source
        var source  = decodeHtmlEntities(srcEl.textContent || srcEl.innerText || '');
        var theme   = srcEl.getAttribute('data-theme') || 'default';
        var allowDl = srcEl.getAttribute('data-allow-download') === 'true';

        if (!source.trim()) {
            hide(loadingEl);
            return;
        }

        // Configure mermaid for this specific diagram
        try {
            mermaid.initialize({
                startOnLoad: false,
                theme: theme,
                securityLevel: 'strict',
                fontFamily: 'inherit',
                logLevel: 'error'
            });
        } catch (initErr) {
            // mermaid may already be initialised; that's fine
        }

        // mermaid.render is async — use callback (mermaid v9) or Promise (v10+)
        var svgId = diagramId + '-svg';

        try {
            var result = mermaid.render(svgId, source);

            // mermaid v10+ returns a Promise
            if (result && typeof result.then === 'function') {
                result.then(function (res) {
                    outputEl.innerHTML = res.svg || res;
                    hide(loadingEl);
                    if (allowDl && toolbarEl) show(toolbarEl);
                }).catch(function (err) {
                    showError(loadingEl, errorEl, errorMsgEl, err);
                });
            } else {
                // mermaid v9 — synchronous callback variant
                // mermaid.render(id, source, callback)
                mermaid.render(svgId, source, function (svgCode, bindFunctions) {
                    outputEl.innerHTML = svgCode;
                    if (typeof bindFunctions === 'function') bindFunctions(outputEl);
                    hide(loadingEl);
                    if (allowDl && toolbarEl) show(toolbarEl);
                });
            }
        } catch (err) {
            showError(loadingEl, errorEl, errorMsgEl, err);
        }
    }

    /**
     * Scan the page for all Mermaid macro containers and render each.
     */
    function renderAll() {
        var containers = document.querySelectorAll('.mermaid-macro-container');
        containers.forEach(function (el) {
            var id = el.getAttribute('data-diagram-id');
            if (id) renderDiagram(id);
        });
    }

    // ------------------------------------------------------------------
    // Download handler
    // ------------------------------------------------------------------

    function handleDownloadClick(e) {
        var btn = e.target.closest('.mermaid-download-btn');
        if (!btn) return;

        var targetId = btn.getAttribute('data-target');
        var outputEl = document.getElementById(targetId + '-output');
        if (!outputEl) return;

        var svgEl = outputEl.querySelector('svg');
        if (!svgEl) return;

        var svgData = new XMLSerializer().serializeToString(svgEl);
        var blob    = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        var url     = URL.createObjectURL(blob);
        var link    = document.createElement('a');

        link.href     = url;
        link.download = 'diagram-' + targetId + '.svg';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    function hide(el) { if (el) el.style.display = 'none'; }
    function show(el) { if (el) el.style.display = ''; }

    function showError(loadingEl, errorEl, errorMsgEl, err) {
        hide(loadingEl);
        show(errorEl);
        if (errorMsgEl && err) {
            errorMsgEl.textContent = (err.message || String(err)).substring(0, 400);
        }
    }

    /**
     * Reverse the 5 HTML entities written by MermaidMacro.escapeHtml().
     * This converts the safely-stored source back to raw diagram text.
     */
    function decodeHtmlEntities(str) {
        var txt = document.createElement('textarea');
        txt.innerHTML = str;
        return txt.value;
    }

    // ------------------------------------------------------------------
    // Initialisation
    // ------------------------------------------------------------------

    function init() {
        if (typeof mermaid === 'undefined') {
            console.warn('[MermaidPlugin] mermaid.min.js not loaded — diagrams will not render.');
            return;
        }

        renderAll();

        // Delegate download clicks to the document body
        document.body.addEventListener('click', handleDownloadClick);
    }

    // Confluence uses AJS.toInit for deferred execution after DOM is ready
    if (global.AJS && typeof global.AJS.toInit === 'function') {
        global.AJS.toInit(init);
    } else if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Re-render after Confluence live-edit / page transitions (Confluence 7+)
    if (global.AJS) {
        var events = ['page-unloaded', 'editor-shown', 'inline-tasks-refreshed'];
        events.forEach(function (evt) {
            try {
                global.AJS.bind(evt, renderAll);
            } catch (_) { /* not all events exist in all versions */ }
        });
    }

}(window));