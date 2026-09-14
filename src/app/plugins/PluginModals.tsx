import { usePluginHostOptional } from './PluginHostProvider';

export function PluginModals() {
  const host = usePluginHostOptional();
  if (!host?.modal) return null;

  const { contributions, modal, closeModal } = host;

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
