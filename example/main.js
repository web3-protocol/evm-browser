const { app, protocol, ipcMain } = require('electron');
const fileUrl = require('file-url');
const BrowserLikeWindow = require('../index');

const yargs = require("yargs");
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
  .option('web3-chain', {
    alias: 'wc',
    type: 'string',
    description: "Add/override a chain definition\nFormat: <chain-id>=<rpc-provider-url> \nMultiple can be provided with multiple --web3-chain use. Override existing chain settings. Examples:\n1=https://eth-mainnet.alchemyapi.io/v2/<your_api_key>\n42170=https://nova.arbitrum.io/rpc\n 5=http://127.0.0.1:8545"
  })
  .option('debug', {
    type: 'boolean',
    // Activate by default for dev work
    default: app.isPackaged == false,
    description: "Show devtools windows, output debugging infos on console"
  })
let args = yargs.parse()

// Add/override chain definitions
let web3ChainOverrides = []
if(args.web3Chain) {
  if((args.web3Chain instanceof Array) == false) {
    args.web3Chain = [args.web3Chain]
  }

  args.web3Chain.map(newChain => newChain.split('=')).map(newChainComponents => {
    if(newChainComponents.length <= 1) {
      console.log("Chain format is invalid");
      process.exit(1)
    }
    let chainId = parseInt(newChainComponents[0]);
    if(isNaN(chainId) || chainId <= 0) {
      console.log("Chain id is invalid");
      process.exit(1)
    }
    let chainRpcUrl = newChainComponents.slice(1).join("=");

    web3ChainOverrides.push({
      id: chainId,
      rpcUrls: [chainRpcUrl]
    })
  })
}



//
// Main electron lifecycle
//

function createWindow() {
  browser = new BrowserLikeWindow({
    controlHeight: 99,
    controlPanel: fileUrl(`${__dirname}/renderer/control.html`),
    startPage: args._.length == 1 ? args._[0] : 'web3://terraformnavigator.eth/',
    blankTitle: 'New tab',
    debug: args.debug, // will open controlPanel's devtools
    winOptions: {
      autoHideMenuBar: args.debug == false,
    },
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
  // Standard : Add fonctionalities, such as localstorage, but will break some calls such 
  // as web3://0x5a985f13345e820aa9618826b85f74c3986e1463:5/tokenSVG/1.svg ; to be debugged
  // { scheme: 'web3', privileges: { standard:true, supportFetchAPI: true, stream: true } },
  { scheme: 'web3', privileges: { supportFetchAPI: true } }
])

app.on('ready', async () => {
  await registerWeb3Protocol(web3ChainOverrides);
  // To be removed later
  // registerEvmProtocol(web3Chains);

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

