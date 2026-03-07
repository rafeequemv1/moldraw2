import React, { useEffect, useMemo, useRef, useState } from 'react';
import SmilesDrawer from 'smiles-drawer';

const splitSideSmiles = (side) =>
  String(side || '')
    .split('.')
    .map((token) => token.trim())
    .filter(Boolean);

const normalizeReaction = (entry, idx) => {
  const reactionSmiles = String(entry?.reactionSmiles || '').trim();
  const [rawReactants, rawProducts] = reactionSmiles.includes('>>')
    ? reactionSmiles.split('>>')
    : ['', ''];
  const reactants = Array.isArray(entry?.reactants) && entry.reactants.length
    ? entry.reactants
    : splitSideSmiles(rawReactants);
  const products = Array.isArray(entry?.products) && entry.products.length
    ? entry.products
    : splitSideSmiles(rawProducts);
  const reagents = Array.isArray(entry?.reagents) ? entry.reagents.filter(Boolean) : [];
  const intermediateSteps = Array.isArray(entry?.intermediateSteps)
    ? entry.intermediateSteps.map((step, stepIdx) => ({
      id: String(step?.id || `${idx}-step-${stepIdx}`),
      title: String(step?.title || `Step ${stepIdx + 1}`),
      reactionSmiles: String(step?.reactionSmiles || '').trim(),
      reagents: Array.isArray(step?.reagents) ? step.reagents.filter(Boolean) : [],
      conditions: String(step?.conditions || ''),
    })).filter((step) => step.reactionSmiles)
    : [];

  return {
    id: String(entry?.id || `reaction-${idx}`),
    name: String(entry?.name || `Reaction ${idx + 1}`),
    summary: String(entry?.summary || ''),
    reactionSmiles,
    reactants,
    products,
    reagents,
    conditions: String(entry?.conditions || ''),
    intermediateSteps,
  };
};

const drawSmiles = (canvas, smiles) => {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!smiles) return;

  const DrawerCtor = SmilesDrawer?.Drawer || SmilesDrawer;
  const parseFn = typeof SmilesDrawer?.parse === 'function'
    ? SmilesDrawer.parse
    : (typeof DrawerCtor?.parse === 'function' ? DrawerCtor.parse : null);
  if (!DrawerCtor || !parseFn) return;

  try {
    const drawer = new DrawerCtor({
      width: canvas.width,
      height: canvas.height,
      compactDrawing: true,
      bondThickness: 1.6,
      shortBondLength: 0.8,
      atomVisualization: 'default',
      themes: {
        light: {
          C: '#111111',
          O: '#111111',
          N: '#111111',
          S: '#111111',
          P: '#111111',
          F: '#111111',
          Cl: '#111111',
          Br: '#111111',
          I: '#111111',
          B: '#111111',
          Si: '#111111',
          H: '#111111',
          BACKGROUND: '#ffffff',
        },
      },
    });
    parseFn(
      smiles,
      (tree) => {
        try {
          drawer.draw(tree, canvas, 'light', false);
        } catch {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
      },
      () => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    );
  } catch {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
};

function ReactionPreview({ reactantSmiles, productSmiles }) {
  const reactantCanvasRef = useRef(null);
  const productCanvasRef = useRef(null);

  useEffect(() => {
    drawSmiles(reactantCanvasRef.current, reactantSmiles);
  }, [reactantSmiles]);

  useEffect(() => {
    drawSmiles(productCanvasRef.current, productSmiles);
  }, [productSmiles]);

  return (
    <div className="rxn-preview">
      <canvas ref={reactantCanvasRef} className="rxn-preview-canvas" width={220} height={100} />
      <div className="rxn-preview-arrow">→</div>
      <canvas ref={productCanvasRef} className="rxn-preview-canvas" width={220} height={100} />
    </div>
  );
}

function ReactionsModal({
  open,
  onClose,
  onSearch,
  onAddReaction,
  onAddAllSteps,
  isLoading,
  loadingSteps,
  activeLoadingStep,
  error,
  reactions,
  includeReactionIntermediates,
  onToggleReactionIntermediates,
  includeCanvasReagentNames,
  onToggleCanvasReagentNames,
  includeCanvasConditions,
  onToggleCanvasConditions,
  appendReactionToCanvas,
  onToggleAppendReactionToCanvas,
  hasGeminiApiKey,
  onOpenAiSetup,
}) {
  const [query, setQuery] = useState('');
  const normalizedReactions = useMemo(
    () => (Array.isArray(reactions) ? reactions.map(normalizeReaction) : []),
    [reactions]
  );

  if (!open) return null;

  return (
    <div className="rxn-modal-backdrop" onClick={onClose}>
      <div className="rxn-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rxn-modal-header">
          <div className="rxn-modal-title">Reactions</div>
          <button className="rxn-modal-close" onClick={onClose} title="Close reactions browser">x</button>
        </div>

        <div className="rxn-modal-body">
          <div className="rxn-search-row">
            <input
              className="rxn-search-input"
              type="text"
              placeholder="Search reactions, reagents, catalysts, or conditions..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && query.trim()) onSearch(query.trim());
              }}
            />
            <button
              className="rxn-search-btn"
              disabled={isLoading || !query.trim()}
              onClick={() => onSearch(query.trim())}
            >
              {isLoading ? 'Searching...' : 'Search'}
            </button>
          </div>

          <div className="rxn-toggle-row">
            <label className="rxn-toggle-item">
              <input
                type="checkbox"
                checked={includeReactionIntermediates}
                onChange={(e) => onToggleReactionIntermediates(e.target.checked)}
              />
              <span>Show all intermediate steps</span>
            </label>
            <label className="rxn-toggle-item">
              <input
                type="checkbox"
                checked={includeCanvasReagentNames}
                onChange={(e) => onToggleCanvasReagentNames(e.target.checked)}
              />
              <span>Add reagent names on canvas</span>
            </label>
            <label className="rxn-toggle-item">
              <input
                type="checkbox"
                checked={includeCanvasConditions}
                onChange={(e) => onToggleCanvasConditions(e.target.checked)}
              />
              <span>Add reaction conditions on canvas</span>
            </label>
            <label className="rxn-toggle-item">
              <input
                type="checkbox"
                checked={appendReactionToCanvas}
                onChange={(e) => onToggleAppendReactionToCanvas(e.target.checked)}
              />
              <span>Append to canvas (do not erase existing)</span>
            </label>
          </div>

          {isLoading && (
            <div className="rxn-loading-panel">
              <div className="rxn-loading-spinner" />
              <div className="rxn-loading-title">Generating reactions with AI...</div>
              <div className="rxn-loading-steps">
                {(Array.isArray(loadingSteps) ? loadingSteps : []).map((step, idx) => (
                  <div
                    key={step}
                    className={`rxn-loading-step ${idx < activeLoadingStep ? 'done' : ''} ${idx === activeLoadingStep ? 'active' : ''}`}
                  >
                    {idx + 1}. {step}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!hasGeminiApiKey && (
            <div className="rxn-ai-warning">
              Connect Gemini AI first to generate reactions.
              <a href="/pages/ai-help.html" target="_blank" rel="noopener noreferrer">How to setup AI</a>
              <button className="rxn-ai-settings-btn" onClick={onOpenAiSetup}>Open AI settings</button>
            </div>
          )}

          {error && <div className="rxn-error">{error}</div>}

          <div className="rxn-results">
            {normalizedReactions.length === 0 && !isLoading && (
              <div className="rxn-empty">
                Search a named reaction, reagent set, or transformation to get AI-generated suggestions.
              </div>
            )}

            {normalizedReactions.map((reaction) => {
              const reactantPreview = reaction.reactants[0] || '';
              const productPreview = reaction.products[0] || '';
              const reagentText = reaction.reagents.length ? reaction.reagents.join(', ') : 'Not specified';
              const baseStepSmiles = [reaction.reactionSmiles];
              return (
                <div key={reaction.id} className="rxn-card">
                  <div className="rxn-card-head">
                    <div>
                      <div className="rxn-card-title">{reaction.name}</div>
                      {reaction.summary && <div className="rxn-card-summary">{reaction.summary}</div>}
                    </div>
                    <button
                      className="rxn-add-btn"
                      disabled={!reaction.reactionSmiles}
                      onClick={() => onAddReaction(reaction)}
                      title="Insert full reaction into 2D canvas"
                    >
                      Add full reaction
                    </button>
                  </div>
                  {includeReactionIntermediates && Array.isArray(reaction.intermediateSteps) && reaction.intermediateSteps.length > 0 && (
                    <div className="rxn-card-actions">
                      <button
                        className="rxn-add-step-btn"
                        onClick={() => onAddAllSteps(reaction)}
                        title="Add all intermediate steps and full reaction"
                      >
                        Add all steps + reaction
                      </button>
                    </div>
                  )}

                  <ReactionPreview reactantSmiles={reactantPreview} productSmiles={productPreview} />

                  <div className="rxn-meta-line"><strong>Reagents:</strong> {reagentText}</div>
                  <div className="rxn-meta-line"><strong>Conditions:</strong> {reaction.conditions || 'Not specified'}</div>
                  <div className="rxn-smiles-line" title={reaction.reactionSmiles || ''}>
                    {reaction.reactionSmiles || 'No reaction SMILES returned'}
                  </div>

                  <div className="rxn-smiles-block">
                    <div className="rxn-smiles-block-title">Reactants SMILES</div>
                    <div className="rxn-smiles-token-wrap">
                      {reaction.reactants.length
                        ? reaction.reactants.map((sm) => <span key={sm} className="rxn-smiles-token">{sm}</span>)
                        : <span className="rxn-smiles-token rxn-smiles-token-muted">Not provided</span>}
                    </div>
                  </div>

                  <div className="rxn-smiles-block">
                    <div className="rxn-smiles-block-title">Products SMILES</div>
                    <div className="rxn-smiles-token-wrap">
                      {reaction.products.length
                        ? reaction.products.map((sm) => <span key={sm} className="rxn-smiles-token">{sm}</span>)
                        : <span className="rxn-smiles-token rxn-smiles-token-muted">Not provided</span>}
                    </div>
                  </div>

                  {includeReactionIntermediates && Array.isArray(reaction.intermediateSteps) && reaction.intermediateSteps.length > 0 && (
                    <div className="rxn-intermediate-wrap">
                      <div className="rxn-intermediate-title">Intermediate Steps</div>
                      {reaction.intermediateSteps.map((step, idx) => (
                        <div key={step.id || `${reaction.id}-i-${idx}`} className="rxn-intermediate-card">
                          <div className="rxn-intermediate-head">
                            <span>{idx + 1}. {step.title || 'Intermediate step'}</span>
                            <button
                              className="rxn-add-step-btn"
                              onClick={() => onAddReaction(reaction, step)}
                              disabled={!step.reactionSmiles}
                              title="Add this intermediate step to canvas"
                            >
                              Add step
                            </button>
                          </div>
                          <div className="rxn-smiles-line" title={step.reactionSmiles || ''}>
                            {step.reactionSmiles || baseStepSmiles[0] || 'No reaction SMILES'}
                          </div>
                          {(step.reagents?.length > 0 || step.conditions) && (
                            <div className="rxn-meta-line">
                              <strong>Step details:</strong> {step.reagents?.length ? step.reagents.join(', ') : 'No reagents'}
                              {step.conditions ? ` | ${step.conditions}` : ''}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ReactionsModal;
