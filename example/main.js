const { app } = require('electron');
const fileUrl = require('file-url');
const BrowserLikeWindow = require('../index');
const yargs = require("yargs");

let browser;

yargs
  .option('web3-url', {
    alias: 'u',
    type: 'string',
    default: null,
    description: 'URL of a web3 provider (https://eth-mainnet.alchemyapi.io/v2/xxxx, http://127.0.0.1:8545, ...)'
  })
let args = yargs.parse()

console.log(args);

function createWindow() {
  browser = new BrowserLikeWindow({
    controlHeight: 99,
    controlPanel: fileUrl(`${__dirname}/renderer/control.html`),
    startPage: 'ethereum://0x4e1f41613c9084fdb9e34e11fae9412427480e56/tokenHTML?tokenId:uint256=4197',
    blankTitle: 'New tab',
    debug: true, // will open controlPanel's devtools
    web3Url: args.web3Url
  });

  browser.on('closed', () => {
    browser = null;
  });
}

app.on('ready', async () => {
  createWindow();
});

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (browser === null) {
    createWindow();
  }
});
