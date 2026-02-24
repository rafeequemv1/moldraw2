import React, { useMemo, useState } from 'react';

const parseNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

function CalculatorModal({ onClose }) {
  const [activeTab, setActiveTab] = useState('solution-prep');

  // Solution preparation from molarity + volume
  const [targetMolarity, setTargetMolarity] = useState('0.10');
  const [targetVolume, setTargetVolume] = useState('250');
  const [molecularWeight, setMolecularWeight] = useState('58.44');
  const [purityPercent, setPurityPercent] = useState('100');

  // Dilution C1V1=C2V2
  const [stockConc, setStockConc] = useState('1.0');
  const [targetConc, setTargetConc] = useState('0.10');
  const [finalVolume, setFinalVolume] = useState('100');

  // Molarity from mass / MW / volume
  const [molarityMass, setMolarityMass] = useState('1.50');
  const [molarityMw, setMolarityMw] = useState('58.44');
  const [molarityVolumeMl, setMolarityVolumeMl] = useState('250');

  // Molality from mass of solute / MW / mass of solvent
  const [molalityMass, setMolalityMass] = useState('1.50');
  const [molalityMw, setMolalityMw] = useState('58.44');
  const [solventMassG, setSolventMassG] = useState('100');

  const tabs = [
    { id: 'solution-prep', label: 'Solution Prep' },
    { id: 'dilution', label: 'Dilution (C1V1=C2V2)' },
    { id: 'molarity', label: 'Molarity' },
    { id: 'molality', label: 'Molality' },
  ];

  const solutionPrep = useMemo(() => {
    const m = parseNum(targetMolarity);
    const volumeMl = parseNum(targetVolume);
    const mw = parseNum(molecularWeight);
    const purity = parseNum(purityPercent);
    if (![m, volumeMl, mw, purity].every(Number.isFinite)) return null;
    if (m <= 0 || volumeMl <= 0 || mw <= 0 || purity <= 0) return null;

    const volumeL = volumeMl / 1000;
    const moles = m * volumeL;
    const idealMass = moles * mw;
    const correctedMass = idealMass / (purity / 100);
    return {
      moles,
      idealMass,
      correctedMass,
    };
  }, [targetMolarity, targetVolume, molecularWeight, purityPercent]);

  const dilution = useMemo(() => {
    const c1 = parseNum(stockConc);
    const c2 = parseNum(targetConc);
    const v2 = parseNum(finalVolume);
    if (![c1, c2, v2].every(Number.isFinite)) return null;
    if (c1 <= 0 || c2 <= 0 || v2 <= 0 || c2 >= c1) return null;

    const v1 = (c2 * v2) / c1;
    const diluent = v2 - v1;
    return { v1, diluent };
  }, [stockConc, targetConc, finalVolume]);

  const molarity = useMemo(() => {
    const mass = parseNum(molarityMass);
    const mw = parseNum(molarityMw);
    const volumeMl = parseNum(molarityVolumeMl);
    if (![mass, mw, volumeMl].every(Number.isFinite)) return null;
    if (mass <= 0 || mw <= 0 || volumeMl <= 0) return null;
    const moles = mass / mw;
    const molarityVal = moles / (volumeMl / 1000);
    return { moles, molarityVal };
  }, [molarityMass, molarityMw, molarityVolumeMl]);

  const molality = useMemo(() => {
    const mass = parseNum(molalityMass);
    const mw = parseNum(molalityMw);
    const solventG = parseNum(solventMassG);
    if (![mass, mw, solventG].every(Number.isFinite)) return null;
    if (mass <= 0 || mw <= 0 || solventG <= 0) return null;
    const moles = mass / mw;
    const molalityVal = moles / (solventG / 1000);
    return { moles, molalityVal };
  }, [molalityMass, molalityMw, solventMassG]);

  return (
    <div className="calc-modal-backdrop" onClick={onClose}>
      <div className="calc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="calc-header">
          <div className="calc-title">Chemistry Calculator</div>
          <button className="calc-close" onClick={onClose}>x</button>
        </div>

        <div className="calc-body">
          <aside className="calc-sidebar">
            <div className="calc-sidebar-title">Calculators</div>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`calc-tab-btn${activeTab === tab.id ? ' active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </aside>

          <section className="calc-content">
            {activeTab === 'solution-prep' && (
              <div className="calc-panel">
                <h3>Solution Prep Calculator</h3>
                <p>Calculate reagent mass for a target molarity and volume.</p>

                <div className="calc-grid">
                  <label>
                    Target molarity (M)
                    <input value={targetMolarity} onChange={(e) => setTargetMolarity(e.target.value)} type="number" step="0.001" min="0" />
                  </label>
                  <label>
                    Target final volume (mL)
                    <input value={targetVolume} onChange={(e) => setTargetVolume(e.target.value)} type="number" step="0.1" min="0" />
                  </label>
                  <label>
                    Molecular weight (g/mol)
                    <input value={molecularWeight} onChange={(e) => setMolecularWeight(e.target.value)} type="number" step="0.001" min="0" />
                  </label>
                  <label>
                    Reagent purity (%)
                    <input value={purityPercent} onChange={(e) => setPurityPercent(e.target.value)} type="number" step="0.1" min="0.1" max="100" />
                  </label>
                </div>

                <div className="calc-result">
                  {solutionPrep ? (
                    <>
                      <div><strong>Moles required:</strong> {solutionPrep.moles.toFixed(6)} mol</div>
                      <div><strong>Mass at 100% purity:</strong> {solutionPrep.idealMass.toFixed(4)} g</div>
                      <div><strong>Mass to weigh (purity-corrected):</strong> {solutionPrep.correctedMass.toFixed(4)} g</div>
                    </>
                  ) : (
                    <div>Enter valid positive values to calculate.</div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'dilution' && (
              <div className="calc-panel">
                <h3>Dilution Calculator (C1V1 = C2V2)</h3>
                <p>Find stock volume and solvent volume for your target concentration.</p>

                <div className="calc-grid">
                  <label>
                    Stock concentration C1
                    <input value={stockConc} onChange={(e) => setStockConc(e.target.value)} type="number" step="0.0001" min="0" />
                  </label>
                  <label>
                    Target concentration C2
                    <input value={targetConc} onChange={(e) => setTargetConc(e.target.value)} type="number" step="0.0001" min="0" />
                  </label>
                  <label>
                    Final volume V2 (mL)
                    <input value={finalVolume} onChange={(e) => setFinalVolume(e.target.value)} type="number" step="0.1" min="0" />
                  </label>
                </div>

                <div className="calc-result">
                  {dilution ? (
                    <>
                      <div><strong>Volume of stock (V1):</strong> {dilution.v1.toFixed(3)} mL</div>
                      <div><strong>Volume of diluent:</strong> {dilution.diluent.toFixed(3)} mL</div>
                    </>
                  ) : (
                    <div>Use valid values with C1 &gt; C2 and positive final volume.</div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'molarity' && (
              <div className="calc-panel">
                <h3>Molarity Calculator</h3>
                <p>Calculate molarity (M) from solute mass, molecular weight, and final solution volume.</p>

                <div className="calc-grid">
                  <label>
                    Solute mass (g)
                    <input value={molarityMass} onChange={(e) => setMolarityMass(e.target.value)} type="number" step="0.001" min="0" />
                  </label>
                  <label>
                    Molecular weight (g/mol)
                    <input value={molarityMw} onChange={(e) => setMolarityMw(e.target.value)} type="number" step="0.001" min="0" />
                  </label>
                  <label>
                    Final solution volume (mL)
                    <input value={molarityVolumeMl} onChange={(e) => setMolarityVolumeMl(e.target.value)} type="number" step="0.1" min="0" />
                  </label>
                </div>

                <div className="calc-result">
                  {molarity ? (
                    <>
                      <div><strong>Moles of solute:</strong> {molarity.moles.toFixed(6)} mol</div>
                      <div><strong>Molarity:</strong> {molarity.molarityVal.toFixed(6)} M</div>
                    </>
                  ) : (
                    <div>Enter valid positive values to calculate molarity.</div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'molality' && (
              <div className="calc-panel">
                <h3>Molality Calculator</h3>
                <p>Calculate molality (mol/kg) from solute mass, molecular weight, and solvent mass.</p>

                <div className="calc-grid">
                  <label>
                    Solute mass (g)
                    <input value={molalityMass} onChange={(e) => setMolalityMass(e.target.value)} type="number" step="0.001" min="0" />
                  </label>
                  <label>
                    Molecular weight (g/mol)
                    <input value={molalityMw} onChange={(e) => setMolalityMw(e.target.value)} type="number" step="0.001" min="0" />
                  </label>
                  <label>
                    Solvent mass (g)
                    <input value={solventMassG} onChange={(e) => setSolventMassG(e.target.value)} type="number" step="0.001" min="0" />
                  </label>
                </div>

                <div className="calc-result">
                  {molality ? (
                    <>
                      <div><strong>Moles of solute:</strong> {molality.moles.toFixed(6)} mol</div>
                      <div><strong>Molality:</strong> {molality.molalityVal.toFixed(6)} mol/kg</div>
                    </>
                  ) : (
                    <div>Enter valid positive values to calculate molality.</div>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default CalculatorModal;
