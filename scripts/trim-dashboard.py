from pathlib import Path

p = Path(r"c:\Users\HEMANTH\Downloads\blueprint-ai\src\components\workspaces\NdpsHeatMapDashboard.tsx")
lines = p.read_text(encoding="utf-8").splitlines(True)
# 1-indexed 172 to 739 inclusive
new_lines = lines[:171] + lines[739:]
text = "".join(new_lines)
text = text.replace("import React, { useMemo, useState } from 'react';", "import React from 'react';")
text = text.replace("  const [hovered, setHovered] = useState<string | null>(null);\n\n", "")
p.write_text(text, encoding="utf-8")
print("lines", len(text.splitlines()))
