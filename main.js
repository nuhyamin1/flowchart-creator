const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron'); // Added Menu
const path = require('path');
const fs = require('fs'); // Import Node.js fs module
const fontList = require('font-list'); // Added for getting system fonts

let mainWindow; // Make mainWindow accessible for menu actions

function createWindow () {
  // Create the browser window.
  // Assign to the outer mainWindow variable instead of declaring a new const
  mainWindow = new BrowserWindow({
    width: 1000, // Increased width for better layout
    height: 750, // Increased height
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // Recommended for security
      nodeIntegration: false // Recommended for security
    }
  });

  // --- NEW: Handle request for system fonts ---
  ipcMain.handle('get-system-fonts', async () => {
    try {
      const fonts = await fontList.getFonts();
      // Optional: Filter or clean up font names if needed
      // e.g., remove duplicates or specific unwanted fonts
      const uniqueFonts = [...new Set(fonts)].sort(); // Get unique names and sort
      console.log(`Found ${uniqueFonts.length} system fonts.`);
      return { success: true, fonts: uniqueFonts };
    } catch (error) {
      console.error('Failed to get system fonts:', error);
      return { success: false, error: error.message };
    }
  });
  // -----------------------------------------

  // Load the index.html of the app.
  mainWindow.loadFile('index.html');

  // Open the DevTools (optional)
  // mainWindow.webContents.openDevTools();
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow();

  // --- Define Application Menu ---
  const menuTemplate = [
    // { role: 'appMenu' } // macOS specific
    ...(process.platform === 'darwin' ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    // { role: 'fileMenu' }
    {
      label: 'File',
      submenu: [
        {
          label: 'Save As...',
          accelerator: 'CmdOrCtrl+S', // Standard save shortcut
          click: () => {
            // Send a message to the renderer process to trigger the save logic
            mainWindow?.webContents.send('request-save-canvas');
          }
        },
        { type: 'separator' }, // Add a separator for visual clarity
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' }
      ]
    },
    // { role: 'editMenu' }
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          click: () => {
            mainWindow?.webContents.send('undo-action'); // Send IPC message
          }
        },
        {
          label: 'Redo',
          accelerator: 'Shift+CmdOrCtrl+Z',
          click: () => {
            mainWindow?.webContents.send('redo-action'); // Send IPC message
          }
        },
        { type: 'separator' },
        { role: 'cut' }, // Keep default cut for text fields, etc.
        {
          label: 'Copy Shape/Text', // Custom label
          accelerator: 'CmdOrCtrl+C',
          click: () => {
            mainWindow?.webContents.send('copy-canvas'); // Send custom IPC message
          }
        },
        {
          label: 'Paste Shape/Text', // Custom label
          accelerator: 'CmdOrCtrl+V',
          click: () => {
            mainWindow?.webContents.send('paste-canvas'); // Send custom IPC message
          }
        },
        ...(process.platform === 'darwin' ? [
          { role: 'pasteAndMatchStyle' },
          { role: 'delete' },
          { role: 'selectAll' },
          { type: 'separator' },
          {
            label: 'Speech',
            submenu: [
              { role: 'startSpeaking' },
              { role: 'stopSpeaking' }
            ]
          }
        ] : [
          { role: 'delete' },
          { type: 'separator' },
          { role: 'selectAll' }
        ])
      ]
    },
    // { role: 'viewMenu' }
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    // { role: 'windowMenu' }
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(process.platform === 'darwin' ? [
          { type: 'separator' },
          { role: 'front' },
          { type: 'separator' },
          { role: 'window' }
        ] : [
          { role: 'close' }
        ])
      ]
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Learn More',
          click: async () => {
            const { shell } = require('electron');
            await shell.openExternal('https://electronjs.org');
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
  // -----------------------------


  // Handle IPC calls from renderer via preload script
  ipcMain.handle('dialog:showSaveDialog', async (event, filter) => {
    const result = await dialog.showSaveDialog(mainWindow, { // Pass mainWindow to parent the dialog
      title: 'Save Flowchart As...',
      buttonLabel: 'Save',
      filters: [filter] // e.g., { name: 'PNG Image', extensions: ['png'] }
    });
    return result; // Send back { canceled, filePath }
  });

  ipcMain.handle('fs:writeFile', async (event, filePath, data) => {
    try {
      // Data URL needs to be converted to a Buffer
      // Format: data:[<mediatype>][;base64],<data>
      const base64Data = data.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, 'base64');
      await fs.promises.writeFile(filePath, buffer);
      return { success: true };
    } catch (error) {
      console.error('Failed to save file:', error);
      return { success: false, error: error.message };
    }
  });


  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
