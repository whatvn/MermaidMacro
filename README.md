# Mermaid Diagrams Plugin for Confluence Data Center

A P2 (server-side) Confluence plugin that adds a **Mermaid macro**, enabling authors to write diagram source text directly in Confluence pages and have it rendered as a crisp SVG — exactly like PlantUML, but powered by [mermaid.js](https://mermaid.js.org).

---

## Prerequisites

| Tool | Version |
|---|---|
| JDK | 11 |
| Atlassian Plugin SDK | 8.x (`atlas-version` to verify) |
| Maven | bundled with SDK (`atlas-mvn`) |

---

## Step 1 — Download mermaid.min.js

The library is **not** bundled in this repo (license / size).  
Download from the official CDN and place at `src/main/resources/js/mermaid.min.js`:

```bash
# mermaid v11 (latest stable as of 2025)
curl -L "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js" \
     -o src/main/resources/js/mermaid.min.js
```

---

## Step 2 — Build

```bash
# Using the Atlassian SDK wrapper
atlas-mvn clean package -DskipTests

# Output: target/mermaid-diagrams-plugin-1.0.x.jar
```

---

## Step 3 — Install to a local dev instance

```bash
# Start Confluence locally (first run downloads Confluence)
atlas-run

# Or install to a running instance via UPM:
# Confluence Admin → Manage apps → Upload app → select the .jar
```

---

## Usage in Confluence pages

1. Edit a page → Insert macro (`+` button or `/mermaid`).
2. Select **Mermaid Diagram** from the macro browser.
3. Write Mermaid syntax in the body field — a live preview appears below.
4. Configure optional parameters:

| Parameter | Options | Default | Description |
|---|---|---|---|
| `theme` | default, dark, neutral, forest | `default` | Mermaid colour theme |
| `align` | left, center, right | `center` | Diagram alignment |
| `height` | integer (px) | *(auto)* | Fixed display height |
| `allowDownload` | true / false | `false` | Show "Download SVG" button |

### Example body

```
flowchart TD
    A[User] -->|POST /payment| B(Payment Gateway)
    B --> C{Idempotency check}
    C -->|Duplicate| D[Return cached result]
    C -->|New request| E[Process payment]
    E --> F[(Database)]
    E --> G[Notify user]
```

---

## Security notes

- All user-supplied macro body content is **HTML-escaped** in Java before being placed into the page.
- The Mermaid library is initialised with `securityLevel: 'strict'`, which sandboxes SVG rendering and disallows JavaScript execution inside diagrams.
- No external network calls are made at render time — everything runs locally within the browser.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Diagram shows "Rendering diagram…" forever | `mermaid.min.js` missing | Confirm file exists at `src/main/resources/js/mermaid.min.js` |
| Velocity template code visible in page | Confluence velocity cache stale after install | Restart Confluence or flush template cache |
| `cannot access com.atlassian.bonnie.Searchable` | SDK / Confluence version mismatch | Use `atlas-mvn` wrapper; check `confluence.version` in pom.xml |
| Macro not appearing in macro browser | Plugin not fully started | Check UPM (`Admin → Manage apps`) for error state |

---

## Releasing a new version

```bash
# Bump version in pom.xml, then:
atlas-mvn clean package -DskipTests
# Upload target/*.jar via Confluence UPM
```

## License
Do whatever you want 