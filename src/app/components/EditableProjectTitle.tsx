import { useEffect, useRef, useState } from 'react';

export interface EditableProjectTitleProps {
  name: string;
  onCommit: (name: string) => void;
}

export function EditableProjectTitle({ name, onCommit }: EditableProjectTitleProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(name);
  }, [name, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="app-top-bar__project-name-input"
        value={draft}
        aria-label="Project name"
        onChange={e => setDraft(e.target.value)}
        onBlur={() => {
          const trimmed = draft.trim();
          if (trimmed) onCommit(trimmed);
          setEditing(false);
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const trimmed = draft.trim();
            if (trimmed) onCommit(trimmed);
            setEditing(false);
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            setDraft(name);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className="app-top-bar__project-name app-top-bar__project-name-btn"
      title={name}
      aria-label={`Project: ${name}. Click to rename.`}
      onClick={() => setEditing(true)}
    >
      {name}
    </button>
  );
}
