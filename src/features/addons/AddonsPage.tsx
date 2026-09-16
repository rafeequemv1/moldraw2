import { useEffect } from 'react';
import '../../styles/addons.css';

const ADDONS_TITLE = 'MolDraw Addons | PowerPoint and Word (Coming Soon)';
const ADDONS_DESCRIPTION =
  'MolDraw addons for Microsoft PowerPoint and Word are coming soon. Draw structures in the browser today, then place them in slides and documents.';

export interface AddonsPageProps {
  onClose: () => void;
}

export function AddonsPage({ onClose }: AddonsPageProps) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = ADDONS_TITLE;
    document.documentElement.classList.add('addons-route');

    const desc = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDesc = desc?.content;
    if (desc) desc.content = ADDONS_DESCRIPTION;

    return () => {
      document.title = previousTitle;
      document.documentElement.classList.remove('addons-route');
      if (desc && previousDesc != null) desc.content = previousDesc;
    };
  }, []);

  return (
    <div className="addons-page" role="document">
      <main className="addons-page__wrap">
        <section className="addons-page__hero">
          <span className="addons-page__eyebrow">Coming soon</span>
          <h1>MolDraw addons for Office</h1>
          <p className="addons-page__lede">
            Bring chemical structures from MolDraw into the slides and papers you already write.
            Addons for PowerPoint and Microsoft Word are in development.
          </p>
          <div className="addons-page__actions">
            <button type="button" className="addons-page__btn addons-page__btn--primary" onClick={onClose}>
              Back to editor
            </button>
            <a className="addons-page__btn" href="/pages/contact.html">
              Contact us
            </a>
          </div>
        </section>

        <section className="addons-page__section">
          <h2>What is coming</h2>
          <p>Short list, no waitlist yet. Draw in the browser today; these addons will follow.</p>
          <div className="addons-page__grid">
            <article className="addons-page__card">
              <span className="addons-page__badge">Coming soon · in testing</span>
              <h3>
                <a href="/chrome-addon">Chrome &amp; Edge addon →</a>
              </h3>
              <p>
                Snip any molecule image on a web page or PDF and open it as an editable structure in
                MolDraw. <a href="/chrome-addon">See the interactive demo</a>.
              </p>
            </article>
            <article className="addons-page__card">
              <span className="addons-page__badge">Coming soon</span>
              <h3>PowerPoint addon</h3>
              <p>
                Insert MolDraw structures into slides for lectures, group meetings, and talks—without
                leaving PowerPoint.
              </p>
            </article>
            <article className="addons-page__card">
              <span className="addons-page__badge">Coming soon</span>
              <h3>Microsoft Word addon</h3>
              <p>
                Place publication-ready structures in reports, theses, and manuscripts, then update
                them as the drawing changes.
              </p>
            </article>
          </div>
        </section>

        <section className="addons-page__note">
          <p>Need this sooner for a classroom or lab? Tell us how you would use it—we read every note.</p>
          <a className="addons-page__btn addons-page__btn--primary" href="/pages/contact.html">
            Request a note
          </a>
        </section>
      </main>
    </div>
  );
}
