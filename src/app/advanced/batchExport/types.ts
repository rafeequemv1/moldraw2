/** One row from CSV / pasted spreadsheet (SMILES + identifier). */
export type BatchTableRow = {
  key: string;
  id: string;
  name: string;
  smiles: string;
  selected: boolean;
  status: 'idle' | 'running' | 'ok' | 'error';
  message?: string;
  molblock2d?: string;
  molblock3d?: string;
};

export type BatchPipelineResult = {
  molblock2d: string;
  molblock3d: string;
  source: string;
};
