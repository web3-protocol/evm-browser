const { app, protocol, ipcMain } = require('electron');
const fileUrl = require('file-url');

const yargs = require("yargs");
const { fetch } = require("undici");
global.fetch = fetch;
const fs = require('fs')

const BrowserLikeWindow = require('./browser-like-window.js');
const { registerWeb3Protocol } = require('./web3-protocol.js')

let browser;



//
// Args processing
//

yargs
  .usage("evm-browser <start-url> [options]")
  .option('chain-rpc', {
    alias: 'wc',
    type: 'string',
    description: "Add/override a chain RPC\nFormat: <chain-id>=<rpc-provider-url> \nMultiple can be provided with multiple --chain-rpc use. Override existing chain settings. Examples:\n1=https://eth-mainnet.alchemyapi.io/v2/<your_api_key>\n42170=https://nova.arbitrum.io/rpc\n 5=http://127.0.0.1:8545"
  })
  .option('chain-ens-registry', {
    alias: 'ens',
    type: 'string',
    requiresArg: true,
    description: "Add/override a chain ENS registry\nFormat: <chain-id>=<ens-registry-address> \nCan be used multiple times. Examples:\n1=0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e\n 31337=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"
  })
  .option('enable-http-https', {
    alias: 'http',
    type: 'boolean',
    default: false,
    description: "Activate HTTP/HTTPS"
  })
  .option('debug', {
    type: 'boolean',
    // Activate by default for dev work
    default: app.isPackaged == false,
    description: "Show devtools windows, output debugging infos on console"
  })
let args = yargs.parse()

// Add/override chain definitions
let chainRpcOverrides = []
if(args.chainRpc) {
  if((args.chainRpc instanceof Array) == false) {
    args.chainRpc = [args.chainRpc]
  }

  args.chainRpc.map(newChain => newChain.split('=')).map(newChainComponents => {
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

    chainRpcOverrides.push({
      id: chainId,
      rpcUrls: [chainRpcUrl]
    })
  })
}

// Add/override ENS registry address
let chainEnsOverrides = []
if(args.chainEnsRegistry) {
  if((args.chainEnsRegistry instanceof Array) == false) {
    args.chainEnsRegistry = [args.chainEnsRegistry]
  }

  args.chainEnsRegistry.map(newChain => newChain.split('=')).map(newChainComponents => {
    if(newChainComponents.length <= 1) {
      console.log("Chain format is invalid");
      process.exit(1)
    }
    let chainId = parseInt(newChainComponents[0]);
    if(isNaN(chainId) || chainId <= 0) {
      console.log("Chain id is invalid");
      process.exit(1)
    }
    let chainEnsRegistry = newChainComponents.slice(1).join("=");

    chainEnsOverrides.push({
      id: chainId,
      ensRegistry: chainEnsRegistry
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
  // Enable web3://
  await registerWeb3Protocol(chainRpcOverrides, chainEnsOverrides);

  // Disable HTTP/HTTPS if not explicitely enabled
  // By default : web3:// only
  if(args.enableHttpHttps == false) {
    // Disable HTTPS
    protocol.handle('https', (req) => {
      return new Response('HTTPS support is disabled. Enable with the --enable-http-https start option.', {
        status: 400,
        headers: { 'content-type': 'text/html' }
      })
    });

    // Disable HTTP
    protocol.handle('http', (req) => {
      return new Response('HTTP support is disabled. Enable with the --enable-http-https start option.', {
        status: 400,
        headers: { 'content-type': 'text/html' }
      })
    });
  }

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

