import { parseMolblockAtoms3d } from './molblockToXyz';
import { spacefillSphereRadius } from '../styleConstants';

/** Simple X3D with a sphere per atom (Bondi vdW radii). */
export function molblockToX3d(molblock: string, title: string): string {
  const atoms = parseMolblockAtoms3d(molblock);
  if (atoms.length === 0) return '';
  const name = escapeXml(title.replace(/\s+/g, ' ').trim() || 'molecule');
  const shapes = atoms
    .map(a => {
      const r = radiusFor(a.sym);
      const c = colorFor(a.sym);
      return `      <Transform translation='${a.x.toFixed(4)} ${a.y.toFixed(4)} ${a.z.toFixed(4)}'>
        <Shape>
          <Appearance><Material diffuseColor='${c}'/></Appearance>
          <Sphere radius='${r.toFixed(3)}'/>
        </Shape>
      </Transform>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<X3D profile='Interchange' version='3.3' xmlns:xsd='http://www.w3.org/2001/XMLSchema-instance'>
  <head><meta name='generator' content='Moldraw'/><meta name='title' content='${name}'/></head>
  <Scene>
    <WorldInfo title='${name}'/>
${shapes}
  </Scene>
</X3D>
`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function radiusFor(el: string): number {
  return spacefillSphereRadius(el);
}

function colorFor(el: string): string {
  const map: Record<string, string> = {
    H: '0.9 0.9 0.9',
    C: '0.2 0.2 0.2',
    N: '0.15 0.3 0.9',
    O: '0.9 0.15 0.15',
    F: '0.2 0.85 0.3',
    S: '0.9 0.8 0.15',
    P: '0.95 0.55 0.1',
    Cl: '0.15 0.8 0.2',
    Br: '0.65 0.2 0.1',
    I: '0.55 0.15 0.7',
  };
  return map[el] ?? '0.7 0.7 0.7';
}
