import React from 'react';
import { IS_CAPACITOR } from '../utils/platform';
import { CinemaPlayerWeb, CinemaPlayerProps } from './CinemaPlayer';
import { NativePlayerLauncher } from './NativePlayerLauncher';

/** Phone app: native ExoPlayer (plays MKV / AC3 / HEVC, MX-style controls). PC / web: the original cinema player. */
export const CinemaPlayer: React.FC<CinemaPlayerProps> = (props) =>
  IS_CAPACITOR ? <NativePlayerLauncher {...props} /> : <CinemaPlayerWeb {...props} />;
