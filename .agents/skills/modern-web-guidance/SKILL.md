---
name: modern-web-guidance
description: Look up browser support and implementation guidance when choosing a native control, focus behavior, browser API, or browser-sensitive layout.
---

From the project root, use the CLI pinned in the lockfile. Search for the browser behavior in English, then retrieve the matching guide by its returned ID.

```sh
DISABLE_TELEMETRY=1 corepack yarn modern-web-guidance search "label checkbox control"
DISABLE_TELEMETRY=1 corepack yarn modern-web-guidance retrieve checkbox
```

Apply the relevant guidance to the website in `site/`. Preserve static HTML, hydration, and the site CSP. Verify the affected browser behavior using the [website instructions](../../../README.md#website).
