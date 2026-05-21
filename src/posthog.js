import posthog from 'posthog-js';

const posthogKey = process.env.REACT_APP_POSTHOG_KEY;
const posthogHost = process.env.REACT_APP_POSTHOG_HOST || 'https://us.i.posthog.com';

if (posthogKey && typeof window !== 'undefined') {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    capture_pageview: true,
    person_profiles: 'identified_only',
  });
}

export default posthog;
