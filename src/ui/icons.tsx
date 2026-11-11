import React from 'react';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import type { AnimalKind } from '../logic/names';
import { colors } from './theme';

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/** Hayvan ikonları: 24x24 çizgi ikonlar (tasarım tuvalindeki set). */
export function AnimalIcon({ kind, size = 24, color = colors.ink, strokeWidth = 1.8 }: IconProps & { kind: AnimalKind }) {
  const common = { fill: 'none', stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const dot = (cx: number, cy: number, r = 0.9) => <Circle cx={cx} cy={cy} r={r} fill={color} />;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {kind === 'lynx' && (
        <>
          <Path d="M5 10L6 3l4 4h4l4-4 1 7a7 7 0 0 1-14 0z" {...common} />
          <Path d="M6 3V1M18 3V1" {...common} />
          {dot(9.5, 11.5)}
          {dot(14.5, 11.5)}
          <Path d="M11 14.5l1 1 1-1" {...common} />
        </>
      )}
      {kind === 'fox' && (
        <>
          <Path d="M4 4l5 5h6l5-5-1 9-7 7-7-7z" {...common} />
          {dot(9.5, 12)}
          {dot(14.5, 12)}
          <Path d="M11 16h2" {...common} />
        </>
      )}
      {kind === 'owl' && (
        <>
          <Path d="M5 9l2-5 3 3h4l3-3 2 5v6a7 7 0 0 1-14 0z" {...common} />
          <Circle cx={9.5} cy={11.5} r={2.2} {...common} />
          <Circle cx={14.5} cy={11.5} r={2.2} {...common} />
          <Path d="M11.2 14.5l.8 1.5.8-1.5z" {...common} />
        </>
      )}
      {kind === 'rabbit' && (
        <>
          <Rect x={8} y={1.5} width={3} height={9} rx={1.5} {...common} />
          <Rect x={13} y={1.5} width={3} height={9} rx={1.5} {...common} />
          <Circle cx={12} cy={15.5} r={6} {...common} />
          {dot(10, 14.5, 0.8)}
          {dot(14, 14.5, 0.8)}
        </>
      )}
      {kind === 'bear' && (
        <>
          <Circle cx={6.5} cy={6.5} r={2.5} {...common} />
          <Circle cx={17.5} cy={6.5} r={2.5} {...common} />
          <Circle cx={12} cy={13} r={7} {...common} />
          <Ellipse cx={12} cy={15.5} rx={3} ry={2} {...common} />
          {dot(9.5, 11.5, 0.8)}
          {dot(14.5, 11.5, 0.8)}
        </>
      )}
      {kind === 'penguin' && (
        <>
          <Path d="M12 2.5a6 6 0 0 0-6 6v7a6 6 0 0 0 12 0v-7a6 6 0 0 0-6-6z" {...common} />
          <Path d="M9 14a3 4 0 0 0 6 0" {...common} />
          <Path d="M11 9l1 1.5 1-1.5z" {...common} />
          {dot(10, 7.5, 0.8)}
          {dot(14, 7.5, 0.8)}
        </>
      )}
      {kind === 'cat' && (
        <>
          <Path d="M5 11V4l4 3h6l4-3v7a7 7 0 0 1-14 0z" {...common} />
          {dot(9.5, 12)}
          {dot(14.5, 12)}
          <Path d="M11 14.5l1 1 1-1M3 14h4M17 14h4" {...common} />
        </>
      )}
      {kind === 'frog' && (
        <>
          <Circle cx={8} cy={7} r={2.8} {...common} />
          <Circle cx={16} cy={7} r={2.8} {...common} />
          <Path d="M5.5 8.5C3.5 10 3 12 3 14c0 3.5 4 6 9 6s9-2.5 9-6c0-2-.5-4-2.5-5.5" {...common} />
          {dot(8, 7)}
          {dot(16, 7)}
          <Path d="M8.5 15c2 1.5 5 1.5 7 0" {...common} />
        </>
      )}
    </Svg>
  );
}

/** Fink logosu: tavşan işareti (512 birimlik çizim, "Hush Logo" tuvalinden). */
export function LogoMark({ size = 28, accent = colors.volt, bg = colors.ink }: { size?: number; accent?: string; bg?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 512 512">
      <G fill={accent} stroke={accent} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M214 250 L196 70" strokeWidth={80} fill="none" />
        <Path d="M296 250 L314 140 Q326 84 376 110 L424 152" strokeWidth={80} fill="none" />
        <Circle cx={256} cy={336} r={140} stroke="none" />
      </G>
      <G stroke={bg} strokeWidth={18} fill="none" strokeLinecap="round">
        <Path d="M182 342 Q206 368 230 342" />
        <Path d="M282 342 Q306 368 330 342" />
      </G>
    </Svg>
  );
}

export function Bolt({ size = 16, color = colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M13 2 L4 14 h7 l-2 8 l9-12 h-7 z" fill={color} />
    </Svg>
  );
}

const stroke = (color: string, w: number) => ({
  fill: 'none',
  stroke: color,
  strokeWidth: w,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export function CameraIcon({ size = 22, color = colors.ink, strokeWidth = 2, check = false, crossed = false }: IconProps & { check?: boolean; crossed?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" {...stroke(color, strokeWidth)} />
      {check ? <Path d="M9 13l2 2 4-4" {...stroke(color, strokeWidth)} /> : <Circle cx={12} cy={13} r={4} {...stroke(color, strokeWidth)} />}
      {crossed && <Path d="M4 4l16 16" {...stroke(color, strokeWidth)} />}
    </Svg>
  );
}

export function Glyph({ name, size = 20, color = colors.text, strokeWidth = 2 }: IconProps & { name: 'close' | 'back' | 'refresh' | 'flip' | 'pin' | 'shield' | 'check' | 'wave' | 'infinity' | 'cup' }) {
  const s = stroke(color, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'close' && <Path d="M6 6l12 12M18 6L6 18" {...s} />}
      {name === 'back' && <Path d="M15 18l-6-6 6-6" {...s} />}
      {name === 'refresh' && (
        <>
          <Path d="M21 12a9 9 0 1 1-3-6.7L21 8" {...s} />
          <Path d="M21 3v5h-5" {...s} />
        </>
      )}
      {name === 'flip' && (
        <>
          <Path d="M20 11a8 8 0 0 0-14.8-3.5M4 4v4h4" {...s} />
          <Path d="M4 13a8 8 0 0 0 14.8 3.5M20 20v-4h-4" {...s} />
        </>
      )}
      {name === 'pin' && (
        <>
          <Path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z" {...s} />
          <Circle cx={12} cy={10} r={2.5} {...s} />
        </>
      )}
      {name === 'shield' && <Path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" {...s} />}
      {name === 'check' && <Path d="M20 6L9 17l-5-5" {...s} />}
      {name === 'wave' && (
        <Path d="M9 11V5a1.5 1.5 0 0 1 3 0v5M12 10V4a1.5 1.5 0 0 1 3 0v6M15 10V6a1.5 1.5 0 0 1 3 0v7a7 7 0 0 1-12.5 4.3L3.6 14a1.5 1.5 0 0 1 2.3-1.9L9 15V8" {...s} />
      )}
      {name === 'infinity' && (
        <Path d="M12 12c-2-2.7-3.6-4-5.5-4a4 4 0 0 0 0 8c1.9 0 3.5-1.3 5.5-4zm0 0c2 2.7 3.6 4 5.5 4a4 4 0 0 0 0-8c-1.9 0-3.5 1.3-5.5 4z" {...s} />
      )}
      {name === 'cup' && (
        <>
          <Path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" {...s} />
          <Path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17M8 3v3M12 3v3" {...s} />
        </>
      )}
    </Svg>
  );
}
