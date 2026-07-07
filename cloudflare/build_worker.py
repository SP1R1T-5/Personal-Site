"""Generate worker.js by embedding ../index.html into worker_template.js.

The HTML is JSON-encoded, which happens to be a valid JavaScript string
literal — so no manual escaping of backticks or ${} is needed.

Run:  python build_worker.py
"""

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))

with open(os.path.join(HERE, "..", "index.html"), encoding="utf-8") as f:
    html = f.read()
with open(os.path.join(HERE, "worker_template.js"), encoding="utf-8") as f:
    template = f.read()

out = template.replace("__HTML__", json.dumps(html))
with open(os.path.join(HERE, "worker.js"), "w", encoding="utf-8") as f:
    f.write(out)

print(f"wrote worker.js ({len(out):,} bytes)")
