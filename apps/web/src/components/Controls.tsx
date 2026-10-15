import { THEME_NAMES, type ThemeName } from '../lib/theme';
import { Segmented } from './Segmented';

export type View = 'radar' | 'map' | 'board';
export const VIEWS: View[] = ['radar', 'map', 'board'];

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Props = {
  view: View;
  onSelectView: (view: View) => void;
  theme: ThemeName;
  onSelectTheme: (theme: ThemeName) => void;
  className?: string;
};

/** View and theme switches, shared by the side panel and the board's top bar. */
export function Controls({ view, onSelectView, theme, onSelectTheme, className = '' }: Props) {
  return (
    <div className={`flex gap-2 ${className}`}>
      <Segmented
        ariaLabel="View"
        options={VIEWS}
        value={view}
        onChange={onSelectView}
        label={capitalize}
        className="flex-1"
      />
      <Segmented
        ariaLabel="Theme"
        options={THEME_NAMES}
        value={theme}
        onChange={onSelectTheme}
        label={capitalize}
      />
    </div>
  );
}
