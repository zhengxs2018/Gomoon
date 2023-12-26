import {
  app,
  shell,
  BrowserWindow,
  Tray,
  Menu,
  clipboard,
  globalShortcut,
  OnBeforeSendHeadersListenerDetails,
  BeforeSendResponse
} from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import trayIcon from '../../resources/icon@20.png?asset'
import { loadUserConfig } from './model'
import { getResourcesPath, quitApp } from './lib'
import { spawn } from 'child_process'

const cors: {
  defaultURLs: string[]
  handler:
    | ((
        details: OnBeforeSendHeadersListenerDetails,
        callback: (beforeSendResponse: BeforeSendResponse) => void
      ) => void)
    | null
} = {
  defaultURLs: [
    'http://www.baidu.com/*',
    'https://dashscope.aliyuncs.com/*',
    'https://aip.baidubce.com/*',
    'https://api.openai.com/*'
  ],
  handler: (details, callback) => {
    const { origin, host } = new URL(details.url)
    details.requestHeaders['Origin'] = origin
    details.requestHeaders['Host'] = host
    callback({ requestHeaders: details.requestHeaders })
  }
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let preKeys = ''

export function setQuicklyWakeUp(keys: string) {
  /**
   * FEAT: 按键监听
   */
  globalShortcut.register(keys, () => {
    if (mainWindow?.isVisible()) {
      mainWindow?.hide()
      return
    }
    mainWindow?.webContents.send('show-window')
    mainWindow?.show()
  })
  preKeys && globalShortcut.unregister(preKeys)
  preKeys = keys
}

export function hideWindow() {
  mainWindow?.hide()
}

export function minimize() {
  mainWindow?.minimize()
}

export function showWindow() {
  mainWindow?.show()
}

export function updateCors(urls: string[]) {
  mainWindow?.webContents.session.webRequest.onBeforeSendHeaders(null)
  mainWindow?.webContents.session.webRequest.onBeforeSendHeaders(
    {
      urls: cors.defaultURLs.concat(urls.map((url) => (url.endsWith('/*') ? url : url + '/*')))
    },
    cors.handler
  )
}

export function createWindow(): void {
  const userConfig = loadUserConfig()

  // Create the browser window.
  mainWindow = new BrowserWindow({
    title: 'Gomoon',
    width: 420,
    height: 650,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    },
    titleBarStyle: 'hidden'
  })

  // preConfig
  mainWindow!.setAlwaysOnTop(userConfig.isOnTop, 'status')
  // FEAT: CORS
  const filter = {
    urls: cors.defaultURLs // Remote API URS for which you are getting CORS error,
  }
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders(filter, cors.handler)

  mainWindow.webContents.session.webRequest.onHeadersReceived(filter, (details, callback) => {
    if (details.responseHeaders) {
      details.responseHeaders['Access-Control-Allow-Origin'] = []
      details.responseHeaders['access-control-allow-origin'] = ['*']
      details.responseHeaders['access-control-allow-headers'] = ['*']
      details.responseHeaders['access-control-allow-methods'] = ['*']
      details.responseHeaders['access-control-allow-credentials'] = ['true']
      details.responseHeaders['Content-Security-Policy'] = []
    }
    callback({ responseHeaders: details.responseHeaders })
  })

  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy':
          "default-src 'self'; script-src https://cdn.jsdelivr.net 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://dashscope.aliyuncs.com https://api.openai.com https://api.chatanywhere.com.cn https://api.chatanywhere.tech  https://tiktoken.pages.dev https://aip.baidubce.com https://cdn.jsdelivr.net http://www.baidu.com data:; img-src https: http: data: 'self'; worker-src 'self' blob:;"
      }
    })
  })

  // FEAT: 链接跳转，自动打开浏览器
  mainWindow.webContents.on('will-frame-navigate', (event) => {
    if (event.url.includes('localhost')) {
      return
    }
    event.preventDefault()
    shell.openExternal(event.url)
  })

  // FEAT: 双击复制回答
  if (userConfig.canMultiCopy) {
    let filename = 'eventTracker'
    if (process.arch === 'x64') {
      filename = 'eventTracker_x64'
    }
    if (process.platform === 'win32') {
      filename += '.exe'
    }
    const eventTracker = spawn(getResourcesPath(filename))
    eventTracker.stdout.on('data', (data) => {
      if (`${data}` === 'multi-copy') {
        const copyText = clipboard.readText()
        mainWindow?.webContents.send('multi-copy', copyText)
        mainWindow?.webContents.send('show-window')
        mainWindow?.show()
        mainWindow?.focus()
      }
    })
    // 应用程序退出时，关闭子进程
    app.on('will-quit', () => {
      // 查看子进程是否已经退出
      !eventTracker.killed && eventTracker.kill()
    })
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
    // Open the DevTools.
    !app.isPackaged && mainWindow!.webContents.openDevTools()
  })

  //FEAT: 快捷键
  setQuicklyWakeUp(userConfig.quicklyWakeUpKeys)

  // 点击关闭时隐藏窗口而不是退出
  mainWindow.on('close', (event) => {
    if (!quitApp.shouldQuit) {
      mainWindow?.hide()
      event.preventDefault()
    }
  })

  // tray
  tray = new Tray(trayIcon)
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '打开主界面',
      click: () => mainWindow?.show()
    },
    {
      label: '退出',
      click: () => {
        mainWindow?.destroy()
        app.quit()
      }
    }
  ])
  tray.setContextMenu(contextMenu)
  tray.setToolTip('Gomoon')
  tray.on('click', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}
