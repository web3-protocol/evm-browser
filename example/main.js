const { app, protocol, ipcMain } = require('electron');
const fileUrl = require('file-url');
const BrowserLikeWindow = require('../index');

const yargs = require("yargs");
let web3Chains = require('viem/chains');
const { fetch } = require("undici");
global.fetch = fetch;
const fs = require('fs')

const { registerWeb3Protocol } = require('./web3-protocol.js')
const { registerEvmProtocol } = require('./evm-protocol.js')

let browser;


//
// Args processing
//

yargs
  .usage("evm-browser <start-url> [options]")
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
    description: 'Web3 chain to use (chain id or one of the following values: ' + Object.keys(web3Chains).join(', ') + ')'
  })
let args = yargs.parse()

// Chain is an id? Find or create a custom chain with his RPC URL
if(args.web3Chain && isNaN(parseInt(args.web3Chain)) == false && args.web3Url) {
  if(Object.entries(web3Chains).filter(chain => chain[1].id == args.web3Chain).length == 1) {
    args.web3Chain = Object.entries(web3Chains).filter(chain => chain[1].id == args.web3Chain)[0][0];
  }
  else {
    // Add the custom chain on the list
    let key = 'custom-' + args.web3Chain
    web3Chains[key] = {
      id: parseInt(args.web3Chain),
      name: key,
      network: key,
      rpcUrls: {
        public: { http: [args.web3Url] },
        default: { http: [args.web3Url] },
      }
    }

    args.web3Chain = key;
  }
}
// Check that chain name is defined
if(args.web3Chain && web3Chains[args.web3Chain] === undefined) {
  console.log("Chain " + args.web3Chain + " is invalid");
  process.exit(1)
}
// If a web3Url is given, we require a chain name
if(args.web3Url && args.web3Chain == null) {
  console.log("If specifying a web3 URL, you must specify the chain to use.");
  process.exit(1)
}


//
// Main electron lifecycle
//

function createWindow() {
  browser = new BrowserLikeWindow({
    controlHeight: 99,
    controlPanel: fileUrl(`${__dirname}/renderer/control.html`),
    startPage: args._.length == 1 ? args._[0] : 'web3://0x74CE1B659b9e16a8F4de0858C6f8794b78767615:5/',
    blankTitle: 'New tab',
    debug: true, // will open controlPanel's devtools
    viewReferences: {
      preload: `${__dirname}/eth-provider-preload.js`,
    }
  });

  browser.on('closed', () => {
    browser = null;
  });
}

// Register the evm protocol as priviledged (authorize the fetch API)
// Must be done before the app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'web3', privileges: { supportFetchAPI: true } },
  { scheme: 'evm', privileges: { supportFetchAPI: true } }
])

app.on('ready', async () => {
  registerWeb3Protocol(args, web3Chains);
  // To be removed later
  registerEvmProtocol(args, web3Chains);

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

app.on('web-contents-created', function (event, wc) {
  wc.on('before-input-event', function (event, input) {
    if(input.type == 'keyDown' && browser) {
      // On ctrl-L : focus the URL bar
      if (input.key === 'l' && input.control && !input.alt && !input.meta && !input.shift) {
        browser.focusUrlBar();
        event.preventDefault()
      }
      // On Ctrl-T : new tab, focus URL bar
      else if (input.key === 't' && input.control && !input.alt && !input.meta && !input.shift) {
        browser.newTab();
        browser.focusUrlBar();
        event.preventDefault()
      }
      // On Ctrl-W : close tab
      else if (input.key === 'w' && input.control && !input.alt && !input.meta && !input.shift) {
        browser.closeTab(browser.currentViewId)
        event.preventDefault()
      }
      // On Ctrl-PageUp : move tab
      else if (input.key === 'PageDown' && input.control && !input.alt && !input.meta && !input.shift) {
        let tabIndex = browser.tabs.indexOf(browser.currentViewId)
        if(tabIndex < browser.tabs.length - 1) {
          browser.switchTab(browser.tabs[tabIndex + 1])
        }
        event.preventDefault()
      }
      // On Ctrl-PageDown : move tab
      else if (input.key === 'PageUp' && input.control && !input.alt && !input.meta && !input.shift) {
        let tabIndex = browser.tabs.indexOf(browser.currentViewId)
        if(tabIndex > 0) {
          browser.switchTab(browser.tabs[tabIndex - 1])
        }
        event.preventDefault()
      }
    }
  })
})



// Expose a JS file to inject in pages, that will populate window.ethereum with
// https://github.com/floating/eth-provider, allowing the webpages to connect
// to the Frame.sh wallet or local ethereum nodes, using the standard EIP-1193 way
ipcMain.handle('getEthProviderJs', () => 
    fs.readFileSync(`${__dirname}/../dist/eth-provider-injected.packed.js`).toString()
)

