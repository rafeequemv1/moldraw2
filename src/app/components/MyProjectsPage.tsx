import { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { DesignLibraryView, type DesignLibraryViewProps } from './DesignLibraryView';

export type MyProjectsPageProps = DesignLibraryViewProps & {
  onRefresh: () => void;
  onBackToEditor: () => void;
};

export function MyProjectsPage({ onRefresh, onBackToEditor, ...libraryProps }: MyProjectsPageProps) {
  useEffect(() => {
    onRefresh();
  }, [onRefresh]);

  return (
    <div className="my-projects-page">
      <header className="my-projects-page__header">
        <button type="button" className="my-projects-page__back" onClick={onBackToEditor}>
          <ArrowLeft size={16} aria-hidden />
          Editor
        </button>
        <div className="my-projects-page__title-wrap">
          <h1 className="my-projects-page__title">My designs</h1>
          <p className="my-projects-page__subtitle">Saved locally on this device</p>
        </div>
      </header>
      <DesignLibraryView {...libraryProps} variant="page" />
    </div>
  );
}
