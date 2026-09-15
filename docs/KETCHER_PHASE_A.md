# Ketcher Phase A (temporary)
# public/ketcher/ and public/ketcher-bridge.html remain so SEO tool pages that
# iframe the bridge keep working. Remove after those tools embed @moldraw/canvas.

# Legacy My Designs continuity
# Pre-Vite designs lived in localStorage `moldraw_local_projects` (and last canvas
# in `moldraw_canvas`). On first load the new editor imports them into IndexedDB
# `moldraw.projects` via `src/app/projects/migrateLegacyMyDesigns.ts` and shows
# them under My Designs. Legacy keys are kept as a backup (not deleted).
