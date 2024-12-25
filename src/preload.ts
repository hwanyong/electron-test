import { contextBridge, ipcRenderer } from 'electron';
import { keyboard, mouse, Key } from '@nut-tree-fork/nut-js';

// 타입 정의
interface KeyboardEventData {
  key: string;
  type: 'keydown' | 'keyup';
  timeStamp: number;
}

interface MouseEventData {
  x: number;
  y: number;
  type: 'move' | 'click' | 'rightClick';
  timeStamp: number;
}

interface ElectronAPI {
  onKeyboardEvent: (callback: (data: KeyboardEventData) => void) => void;
  onMouseEvent: (callback: (data: MouseEventData) => void) => void;
}

// Hide traffic lights as early as possible
document.addEventListener('DOMContentLoaded', () => {
  const style = document.createElement('style');
  style.innerHTML = `
    .titlebar-controls,
    :root {
      opacity: 0 !important;
      pointer-events: none !important;
      display: none !important;
    }
    .toolbar-button,
    .traffic-lights {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
    }
  `;
  document.head.appendChild(style);
});

let isTrackingEnabled = false;

const startMouseTracking = async () => {
  if (!isTrackingEnabled) return;

  let lastPosition = { x: 0, y: 0 };
  let lastUpdateTime = 0;
  const THROTTLE_MS = 16;

  while (isTrackingEnabled) {
    const currentPosition = await mouse.getPosition();
    const now = Date.now();

    if (now - lastUpdateTime < THROTTLE_MS) {
      await new Promise(resolve => setTimeout(resolve, 1));
      continue;
    }

    if (currentPosition.x === lastPosition.x && currentPosition.y === lastPosition.y) {
      await new Promise(resolve => setTimeout(resolve, 1));
      continue;
    }

    window.postMessage({
      type: 'mouse-event',
      data: {
        x: currentPosition.x,
        y: currentPosition.y,
        type: 'move',
        timeStamp: now
      }
    });

    lastPosition = currentPosition;
    lastUpdateTime = now;
    await new Promise(resolve => setTimeout(resolve, 1));
  }
};

/**
 * @nut-tree-fork/nut-js API를 사용한 키보드 이벤트 추적 방식
 * 
 * 장점:
 * - 시스템 수준의 키보드 이벤트 감지 가능
 * - 백그라운드에서도 동작
 * 
 * 단점:
 * - 실제로 키를 누르는 동작이 필요
 * - CPU 사용량이 높음
 * - 다른 애플리케이션에 영향을 줄 수 있음
 * 
 * 코드:
 * ```typescript
 * const startKeyboardTracking = async () => {
 *   if (!isTrackingEnabled) return;
 *   
 *   keyboard.config.autoDelayMs = 0;
 *   const keyStates = new Map<Key, boolean>();
 *   const keys = Object.values(Key).filter(key => typeof key !== 'string') as Key[];
 * 
 *   while (isTrackingEnabled) {
 *     for (const key of keys) {
 *       try {
 *         await keyboard.pressKey(key);
 *         if (!keyStates.get(key)) {
 *           keyStates.set(key, true);
 *           window.postMessage({
 *             type: 'keyboard-event',
 *             data: {
 *               key: key.toString(),
 *               type: 'keydown',
 *               timeStamp: Date.now()
 *             }
 *           });
 *         }
 *       } catch {
 *         if (keyStates.get(key)) {
 *           keyStates.set(key, false);
 *           window.postMessage({
 *             type: 'keyboard-event',
 *             data: {
 *               key: key.toString(),
 *               type: 'keyup',
 *               timeStamp: Date.now()
 *             }
 *           });
 *         }
 *       } finally {
 *         try {
 *           await keyboard.releaseKey(key);
 *         } catch {}
 *       }
 *     }
 *     await new Promise(resolve => setTimeout(resolve, 1));
 *   }
 * };
 * ```
 */

// Window API를 사용한 키보드 이벤트 추적 방식
const startKeyboardTracking = () => {
  if (!isTrackingEnabled) return;

  const handleKeyDown = (event: KeyboardEvent) => {
    if (!isTrackingEnabled) return;
    
    window.postMessage({
      type: 'keyboard-event',
      data: {
        key: event.key,
        type: 'keydown',
        timeStamp: Date.now()
      }
    });
  };

  const handleKeyUp = (event: KeyboardEvent) => {
    if (!isTrackingEnabled) return;
    
    window.postMessage({
      type: 'keyboard-event',
      data: {
        key: event.key,
        type: 'keyup',
        timeStamp: Date.now()
      }
    });
  };

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);

  // 정리 함수 반환
  return () => {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
  };
};

// 권한 상태 수신
ipcRenderer.on('permission-status', (_event, isGranted: boolean) => {
  isTrackingEnabled = isGranted;
  if (!isGranted) return;
  
  // startMouseTracking();
  const cleanupKeyboardTracking = startKeyboardTracking();
  ipcRenderer.on('permission-status', (_event, isGranted: boolean) => {
    if (!isGranted && cleanupKeyboardTracking) {
      cleanupKeyboardTracking();
    }
  });
});

// API 정의 및 노출
contextBridge.exposeInMainWorld('electronAPI', {
  onKeyboardEvent: (callback: (data: KeyboardEventData) => void) => {
    window.addEventListener('message', (event) => {
      if (event.data.type !== 'keyboard-event') return;
      console.log('키보드 이벤트 수신:', event.data.data);
      callback(event.data.data);
    });
  },
  onMouseEvent: (callback: (data: MouseEventData) => void) => {
    window.addEventListener('message', (event) => {
      if (event.data.type !== 'mouse-event') return;
      console.log('마우스 이벤트 수신:', event.data.data);
      callback(event.data.data);
    });
  }
});

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
