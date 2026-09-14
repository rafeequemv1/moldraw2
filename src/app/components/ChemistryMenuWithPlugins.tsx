import { ChemistryMenu, type ChemistryMenuProps } from './ChemistryMenu';
import { usePluginHostOptional } from '../plugins';

export function ChemistryMenuWithPlugins(props: ChemistryMenuProps) {
  const pluginHost = usePluginHostOptional();
  return <ChemistryMenu {...props} pluginMenus={pluginHost?.chemistryMenus ?? []} />;
}
