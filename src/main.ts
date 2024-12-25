import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false,
    transparent: true,
    hasShadow: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: true,
      preload: fileURLToPath(new URL('./preload.mjs', import.meta.url))
    }
  });

  mainWindow.loadFile(join(__dirname, '../index.html'));
  mainWindow.setWindowButtonVisibility(false);
  mainWindow.webContents.openDevTools();

  // 윈도우가 로드된 후 권한 확인 다이얼로그 표시
  mainWindow.webContents.on('did-finish-load', async () => {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['허용', '거부'],
      defaultId: 1,
      title: '권한 확인',
      message: '시스템 이벤트 감지 권한이 필요합니다.',
      detail: '키보드와 마우스 이벤트를 감지하기 위해 권한이 필요합니다. 허용하시겠습니까?'
    });

    const isGranted = response === 0;
    mainWindow.webContents.send('permission-status', isGranted);
  });

  // 키보드 이벤트 처리
  ipcMain.on('keyboard-event', (event, data) => {
    console.log('메인 프로세스 키보드 이벤트 수신:', data);
    mainWindow.webContents.send('keyboard-event', data);
  });
};

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
