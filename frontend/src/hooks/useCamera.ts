import { useMemo } from 'react';
import { CAMERA_STREAM_URL } from '@/lib/constants';

export function useCamera() {
  const streamUrl = useMemo(() => CAMERA_STREAM_URL, []);
  const isActive = true;
  return { streamUrl, isActive };
}
