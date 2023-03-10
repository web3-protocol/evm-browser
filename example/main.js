const { app } = require('electron');
const fileUrl = require('file-url');
const BrowserLikeWindow = require('../index');
const yargs = require("yargs");
const web3Chains = require('viem/chains');

let browser;

yargs
  .option('web3-url', {
    alias: 'wu',
    type: 'string',
    default: null,
    description: 'URL of a web3 provider (https://eth-mainnet.alchemyapi.io/v2/xxxx, http://127.0.0.1:8545, ...)'
  })
  .option('web3-chain', {
    alias: 'wc',
    type: 'string',
    defaultDescription: 'mainnet',
    description: 'Web3 chain to use (' + Object.keys(web3Chains).join(', ') + ')'
  })
let args = yargs.parse()

if(args.web3Chain && web3Chains[args.web3Chain] === undefined) {
  console.log("Chain " + args.web3Chain + " is invalid");
  process.exit(1)
}

if(args.web3Url && args.web3Chain == null) {
  console.log("If specifying a web3 URL, you must specify the chain to use.");
  process.exit(1)
}

function createWindow() {
  browser = new BrowserLikeWindow({
    controlHeight: 99,
    controlPanel: fileUrl(`${__dirname}/renderer/control.html`),
    startPage: 'evm://0x4e1f41613c9084fdb9e34e11fae9412427480e56/tokenHTML?tokenId:uint256=4197',
    blankTitle: 'New tab',
    debug: true, // will open controlPanel's devtools
    web3Url: args.web3Url,
    web3Chain: args.web3Chain
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
