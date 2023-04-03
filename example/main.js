const { app, protocol, ipcMain } = require('electron');
const fileUrl = require('file-url');
const BrowserLikeWindow = require('../index');

let web3Chains = require('viem/chains');
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
    description: "Add/override a chain definition\nFormat: <chain-id>=<rpc-provider-url> \nMultiple can be provided with multiple --web3-chain use. Override existing chain settings. Examples:\n1=https://eth-mainnet.alchemyapi.io/v2/xxxx\n42170=https://nova.arbitrum.io/rpc\n 5=http://127.0.0.1:8545\n\nNatively supported chains : " + Object.keys(web3Chains).join(', ')
  })
let args = yargs.parse()

// Add/override chain definitions
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

    // Check if chain already defined
    let alreadyDefinedChains = Object.entries(web3Chains).filter(chain => chain[1].id == chainId)
    if(alreadyDefinedChains.length == 1) {
      let chainKey = alreadyDefinedChains[0][0];
      web3Chains[chainKey].rpcUrls.default.http = [chainRpcUrl]
      web3Chains[chainKey].rpcUrls.default.webSocket = undefined
      web3Chains[chainKey].rpcUrls.public.http = [chainRpcUrl]
      web3Chains[chainKey].rpcUrls.public.webSocket = undefined
    }
    else {
      // Add the custom chain on the list
      let key = 'custom-' + chainId
      web3Chains[key] = {
        id: parseInt(chainId),
        name: key,
        network: key,
        rpcUrls: {
          public: { http: [chainRpcUrl] },
          default: { http: [chainRpcUrl] },
        }
      }
    }
  })
}



//
// Main electron lifecycle
//

function createWindow() {
  browser = new BrowserLikeWindow({
    controlHeight: 99,
    controlPanel: fileUrl(`${__dirname}/renderer/control.html`),
    startPage: args._.length == 1 ? args._[0] : 'web3://0xA66556f4DB239E713491859258E577f25510eFd6:5/',
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
  registerWeb3Protocol(web3Chains);
  // To be removed later
  registerEvmProtocol(web3Chains);

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

