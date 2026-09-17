import { useState, type ClipboardEvent, type FormEvent } from 'react';
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient';
import { useChromeOverlay } from '../chromeDismiss';

export interface FeatureRequestModalProps {
  open: boolean;
  defaultEmail: string;
  onClose: () => void;
}

function displayNameFromEmail(email: string): string {
  return email.split('@')[0]?.replace(/[._-]+/g, ' ') || 'Chemist';
}

function imageFilesFromClipboard(clipboard: DataTransfer | null): File[] {
  if (!clipboard) return [];
  const seen = new Set<string>();
  const files: File[] = [];
  const add = (file: File | null) => {
    if (!file || !file.type.startsWith('image/')) return;
    const key = `${file.name}|${file.size}|${file.type}|${file.lastModified}`;
    if (seen.has(key)) return;
    seen.add(key);
    files.push(file);
  };
  for (const item of Array.from(clipboard.items || [])) {
    if (item.kind === 'file') add(item.getAsFile());
  }
  if (!files.length) {
    for (const file of Array.from(clipboard.files || [])) add(file);
  }
  return files.map(file => {
    if (file.name && file.type) return file;
    const type = file.type || 'image/png';
    const subtype = type.split('/')[1] || 'png';
    const ext = subtype === 'jpeg' ? 'jpg' : subtype;
    return new File([file], file.name || `pasted-image.${ext}`, { type, lastModified: file.lastModified || Date.now() });
  });
}

export function FeatureRequestModal({ open, defaultEmail, onClose }: FeatureRequestModalProps) {
  useChromeOverlay(open, onClose, 'modal');
  const [email, setEmail] = useState(defaultEmail);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const addImageFiles = (incoming: File[]) => {
    const next = incoming.filter(file => file.type.startsWith('image/'));
    if (!next.length) return;
    setFiles(prev => prev.concat(next).slice(0, 5));
  };

  const onPasteImages = (event: ClipboardEvent<HTMLFormElement>) => {
    const next = imageFilesFromClipboard(event.clipboardData);
    if (!next.length) return;
    event.preventDefault();
    addImageFiles(next);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!isSupabaseConfigured || !supabase) {
      setError('Feature requests are not connected yet.');
      return;
    }
    const nextEmail = email.trim();
    const nextTitle = title.trim();
    const nextDescription = description.trim();
    if (!nextEmail || !nextTitle || !nextDescription) {
      setError('Please add your email, title, and request.');
      return;
    }

    setSubmitting(true);
    try {
      const imageUrls: string[] = [];
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      for (const file of files) {
        const safeName = file.name.replace(/[^a-z0-9._-]/gi, '-').toLowerCase();
        const path = `${requestId}/${Date.now()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from('feature-request-images')
          .upload(path, file, { cacheControl: '3600', upsert: false });
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from('feature-request-images').getPublicUrl(path);
        if (data?.publicUrl) imageUrls.push(data.publicUrl);
      }
      const { error: insertError } = await supabase.from('feature_requests').insert({
        email: nextEmail,
        name: displayNameFromEmail(nextEmail),
        title: nextTitle,
        description: nextDescription,
        image_urls: imageUrls,
      });
      if (insertError) throw insertError;
      setNotice('Thanks — your request was sent.');
      setTitle('');
      setDescription('');
      setFiles([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send this feature request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="feature-request-backdrop">
      <form className="feature-request-modal" onSubmit={onSubmit} onPaste={onPasteImages}>
        <div className="feature-request-header">
          <div>
            <div className="feature-request-title">Request a feature</div>
            <div className="feature-request-subtitle">
              Tell us what would make MolDraw better for your workflow.
            </div>
          </div>
          <button type="button" className="feature-request-close" onClick={onClose} aria-label="Close feature request">
            ×
          </button>
        </div>

        <div className="feature-request-tabs" aria-label="Feature request views">
          <button type="button" className="feature-request-tab active">
            Request feature
          </button>
          <a
            className="feature-request-tab"
            href="/community/#feature-requests"
            target="_blank"
            rel="noopener noreferrer"
          >
            Requests by others
          </a>
        </div>

        <label className="feature-request-field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </label>
        <label className="feature-request-field">
          <span>Feature title</span>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Example: Save molecule to dashboard"
            maxLength={160}
            required
          />
        </label>
        <label className="feature-request-field">
          <span>What should it do?</span>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Describe the feature, problem, or workflow."
            rows={5}
            required
          />
        </label>
        <label className="feature-request-field">
          <span>Upload image/s optional</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            onChange={e => {
              addImageFiles(Array.from(e.target.files || []));
              e.target.value = '';
            }}
          />
          {files.length > 0 ? (
            <small>
              {files.length} image{files.length === 1 ? '' : 's'} selected. Max 5 MB each.
            </small>
          ) : null}
        </label>

        {notice ? <div className="feature-request-notice">{notice}</div> : null}
        {error ? <div className="feature-request-error">{error}</div> : null}

        <div className="feature-request-actions">
          <button type="submit" className="feature-request-submit" disabled={submitting}>
            {submitting ? 'Sending...' : 'Send request'}
          </button>
          <button type="button" className="feature-request-cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
