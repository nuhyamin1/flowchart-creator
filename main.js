const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs'); // Import Node.js fs module

function createWindow () {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1000, // Increased width for better layout
    height: 750, // Increased height
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // Recommended for security
      nodeIntegration: false // Recommended for security
    }
  });

  // and load the index.html of the app.
  mainWindow.loadFile('index.html');

  // Open the DevTools (optional)
  // mainWindow.webContents.openDevTools();
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow();

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
