/**
 * Tiny poly-alanine α-helix used when RCSB is unreachable so the Protein tab
 * always has a structure on first open.
 */
export const DEFAULT_HELIX_LABEL = 'Poly-Ala helix (demo)';

export const DEFAULT_HELIX_PDB = `HEADER    DEMO HELIX
TITLE     SHORT POLYALANINE ALPHA HELIX
ATOM      1  N   ALA A   1       1.201  -0.387   0.000  1.00  0.00           N
ATOM      2  CA  ALA A   1       2.416   0.420   0.000  1.00  0.00           C
ATOM      3  C   ALA A   1       3.616  -0.387   0.520  1.00  0.00           C
ATOM      4  O   ALA A   1       3.616  -1.607   0.520  1.00  0.00           O
ATOM      5  CB  ALA A   1       2.416   1.420  -1.201  1.00  0.00           C
ATOM      6  N   ALA A   2       4.679   0.294   0.900  1.00  0.00           N
ATOM      7  CA  ALA A   2       5.900  -0.387   1.401  1.00  0.00           C
ATOM      8  C   ALA A   2       6.616   0.420   2.449  1.00  0.00           C
ATOM      9  O   ALA A   2       6.201   1.573   2.701  1.00  0.00           O
ATOM     10  CB  ALA A   2       6.784  -0.900   0.300  1.00  0.00           C
ATOM     11  N   ALA A   3       7.748   0.000   2.900  1.00  0.00           N
ATOM     12  CA  ALA A   3       8.549   0.784   3.816  1.00  0.00           C
ATOM     13  C   ALA A   3       8.000   0.784   5.216  1.00  0.00           C
ATOM     14  O   ALA A   3       7.000   0.100   5.516  1.00  0.00           O
ATOM     15  CB  ALA A   3       9.984   0.300   3.700  1.00  0.00           C
ATOM     16  N   ALA A   4       8.616   1.500   6.100  1.00  0.00           N
ATOM     17  CA  ALA A   4       8.232   1.616   7.484  1.00  0.00           C
ATOM     18  C   ALA A   4       6.832   2.232   7.700  1.00  0.00           C
ATOM     19  O   ALA A   4       6.700   3.432   7.500  1.00  0.00           O
ATOM     20  CB  ALA A   4       9.232   2.432   8.300  1.00  0.00           C
ATOM     21  N   ALA A   5       5.848   1.484   8.100  1.00  0.00           N
ATOM     22  CA  ALA A   5       4.484   1.932   8.348  1.00  0.00           C
ATOM     23  C   ALA A   5       3.700   1.000   9.248  1.00  0.00           C
ATOM     24  O   ALA A   5       3.900  -0.200   9.200  1.00  0.00           O
ATOM     25  CB  ALA A   5       3.784   2.132   7.000  1.00  0.00           C
ATOM     26  N   ALA A   6       2.784   1.500  10.100  1.00  0.00           N
ATOM     27  CA  ALA A   6       1.900   0.732  10.984  1.00  0.00           C
ATOM     28  C   ALA A   6       2.400  -0.584  11.500  1.00  0.00           C
ATOM     29  O   ALA A   6       3.400  -0.700  12.184  1.00  0.00           O
ATOM     30  CB  ALA A   6       0.500   0.500  10.348  1.00  0.00           C
ATOM     31  N   ALA A   7       1.700  -1.584  11.100  1.00  0.00           N
ATOM     32  CA  ALA A   7       2.000  -2.900  11.548  1.00  0.00           C
ATOM     33  C   ALA A   7       3.400  -3.400  11.100  1.00  0.00           C
ATOM     34  O   ALA A   7       3.600  -4.600  10.984  1.00  0.00           O
ATOM     35  CB  ALA A   7       1.000  -3.784  10.848  1.00  0.00           C
ATOM     36  N   ALA A   8       4.300  -2.548  10.848  1.00  0.00           N
ATOM     37  CA  ALA A   8       5.684  -2.900  10.500  1.00  0.00           C
ATOM     38  C   ALA A   8       6.500  -1.784   9.848  1.00  0.00           C
ATOM     39  O   ALA A   8       7.700  -1.900   9.700  1.00  0.00           O
ATOM     40  CB  ALA A   8       6.300  -3.400  11.784  1.00  0.00           C
END
`;
