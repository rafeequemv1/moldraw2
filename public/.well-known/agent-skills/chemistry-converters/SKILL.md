---
name: chemistry-converters
description: Use MolDraw chemistry conversion tools and APIs for SMILES, 3D structures, XYZ coordinates, and formula lookups.
---

# MolDraw chemistry converters

Use this skill when a user needs to convert chemical structures, generate 3D coordinates, or find the right MolDraw tool for a format conversion.

## High-intent tool pages

| Task | URL |
| --- | --- |
| SMILES to 2D structure | https://www.moldraw.com/tools/free-chem-tools/smiles-to-structure.html |
| Structure to SMILES | https://www.moldraw.com/tools/free-chem-tools/structure-to-smiles-converter.html |
| Name to structure | https://www.moldraw.com/tools/free-chem-tools/name-to-structure.html |
| XYZ / Gaussian to 2D | https://www.moldraw.com/tools/free-chem-tools/xyz-gaussian-to-2d-structure.html |
| XYZ to SMILES | https://www.moldraw.com/tools/free-chem-tools/xyz-to-smiles-converter.html |
| SMILES to 3D (page) | https://www.moldraw.com/tools/free-chem-tools/smiles-to-3d-structure-converter.html |
| Molecular weight | https://www.moldraw.com/tools/free-chem-tools/molecular-weight-calculator.html |
| Formula tools | https://www.moldraw.com/tools/free-chem-tools/formula-and-mass-tools.html |

## HTTP APIs

### POST /api/convert-3d

Generate a 3D SDF conformer from SMILES (NCI Cactus backend).

```json
{ "smiles": "CCO" }
```

Response fields: `sdf`, `source`, `stats`, `tier`, `tried`.

### POST /api/gemini-chat

In-app chemistry assistant (requires user Gemini API key in request body).

```json
{
  "prompt": "Draw ethanol",
  "apiKey": "USER_GEMINI_API_KEY",
  "smiles": null,
  "molfile": null
}
```

See https://www.moldraw.com/pages/ai-help.html for key setup.

## Notes

- 3D generation uses NCI Cactus; verify geometry for large or stereochemically sensitive molecules.
- For editable 2D output from coordinates, prefer the XYZ/Gaussian to 2D tool so users can review bonds in the canvas.
