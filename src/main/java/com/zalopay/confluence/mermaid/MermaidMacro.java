package com.zalopay.confluence.mermaid;

import com.atlassian.confluence.content.render.xhtml.ConversionContext;
import com.atlassian.confluence.macro.Macro;
import com.atlassian.confluence.macro.MacroExecutionException;
import com.atlassian.confluence.renderer.radeox.macros.MacroUtils;
import com.atlassian.confluence.util.velocity.VelocityUtils;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;
import java.util.UUID;

/**
 * MermaidMacro — Confluence Data Center P2 macro that renders Mermaid diagrams.
 *
 * <p>The macro body contains raw Mermaid syntax (plain text). The execute()
 * method escapes the source and injects it into a Velocity template together
 * with a unique element ID; the bundled mermaid-render.js picks up the element
 * at page-load time and calls mermaid.render() client-side.</p>
 *
 * <p>Security note: all user-supplied content is HTML-escaped before it is
 * placed into the page.  The mermaid library itself enforces its own sandbox
 * via securityLevel: 'strict'.</p>
 */
public class MermaidMacro implements Macro {

    private static final Logger log = LoggerFactory.getLogger(MermaidMacro.class);

    // Relative path inside the plugin JAR (src/main/resources/…)
    private static final String TEMPLATE_PATH =
            "templates/mermaid-macro.vm";

    // Allowed enum values — validated to guard against injection via parameters
    private static final java.util.Set<String> VALID_THEMES =
            java.util.Set.of("default", "dark", "neutral", "forest");
    private static final java.util.Set<String> VALID_ALIGNS =
            java.util.Set.of("left", "center", "right");

    // -----------------------------------------------------------------------
    // Macro interface
    // -----------------------------------------------------------------------

    @Override
    public String execute(Map<String, String> params,
                          String body,
                          ConversionContext ctx) throws MacroExecutionException {
        // Guard: empty body
        if (StringUtils.isBlank(body)) {
            return renderError("No Mermaid diagram source provided. "
                    + "Add your diagram syntax to the macro body.");
        }

        // Sanitise & validate parameters
        String theme        = sanitiseEnum(params.getOrDefault("theme",         "default"), VALID_THEMES,  "default");
        String align        = sanitiseEnum(params.getOrDefault("align",         "center"),  VALID_ALIGNS,  "center");
        String heightRaw    = params.getOrDefault("height",        "").trim();
        boolean allowDl     = Boolean.parseBoolean(params.getOrDefault("allowDownload", "false"));

        // Validate height: only accept positive integers (pixels), empty = auto
        String height = "";
        if (!heightRaw.isEmpty()) {
            try {
                int h = Integer.parseInt(heightRaw);
                if (h > 0 && h <= 10000) height = String.valueOf(h);
            } catch (NumberFormatException e) {
                log.warn("MermaidMacro: invalid height param '{}', ignoring", heightRaw);
            }
        }

        // Stable unique ID per macro instance on the page
        String diagramId = "mermaid-" + UUID.randomUUID().toString().replace("-", "");

        // Escape diagram source for safe embedding in an HTML attribute / pre tag
        String escapedSource = escapeHtml(body.trim());

        // Build Velocity context
        Map<String, Object> vc = MacroUtils.defaultVelocityContext();
        vc.put("diagramId",    diagramId);
        vc.put("source",       escapedSource);
        vc.put("theme",        theme);
        vc.put("align",        align);
        vc.put("height",       height);
        vc.put("allowDownload",allowDl);

        try {
            return VelocityUtils.getRenderedTemplate(TEMPLATE_PATH, vc);
        } catch (Exception e) {
            log.error("MermaidMacro: failed to render Velocity template", e);
            return renderError("Internal error rendering diagram. "
                    + "Check Confluence logs for details.");
        }
    }

    @Override
    public BodyType getBodyType() {
        return BodyType.PLAIN_TEXT;
    }

    @Override
    public OutputType getOutputType() {
        return OutputType.BLOCK;
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    /**
     * Returns {@code value} if it is in {@code allowed}, otherwise
     * returns {@code fallback}.  Prevents parameter injection.
     */
    private String sanitiseEnum(String value, java.util.Set<String> allowed, String fallback) {
        return allowed.contains(value) ? value : fallback;
    }

    /**
     * Minimal HTML escaping — converts the five characters that are
     * dangerous when injected into HTML/attribute context.
     */
    static String escapeHtml(String s) {
        if (s == null) return "";
        return s.replace("&",  "&amp;")
                .replace("<",  "&lt;")
                .replace(">",  "&gt;")
                .replace("\"", "&quot;")
                .replace("'",  "&#39;");
    }

    /**
     * Returns a styled AUI warning message when the macro cannot render.
     */
    private String renderError(String message) {
        return "<div class=\"aui-message aui-message-warning\" "
                + "style=\"margin:8px 0;\">"
                + "<span class=\"aui-icon icon-warning\"></span>"
                + "<p class=\"title\"><strong>Mermaid Diagram</strong></p>"
                + "<p>" + escapeHtml(message) + "</p>"
                + "</div>";
    }
}