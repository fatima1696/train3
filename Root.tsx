import React from 'react';
import {Composition} from 'remotion';
import {TrainVideo, FPS, DURATION} from './TrainVideo';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="TrainWheels"
      component={TrainVideo}
      durationInFrames={DURATION}
      fps={FPS}
      width={1080}
      height={1920}
    />
  );
};
