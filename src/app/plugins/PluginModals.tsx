import { usePluginHostOptional } from './PluginHostProvider';
import { useChromeOverlay } from '../chromeDismiss';

export function PluginModals() {
  const host = usePluginHostOptional();
  const closeModal = host?.closeModal ?? (() => {});
  useChromeOverlay(Boolean(host?.modal), closeModal, 'modal');
  if (!host?.modal) return null;

  const { contributions, modal } = host;

  const panel = contributions.panels.find(p => p.id === modal.id);
  if (!panel) return null;

  const Component = panel.component;
  return (
    <Component
      open
      onClose={closeModal}
      {...modal.props}
    />
  );
}
