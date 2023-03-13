const { app, protocol, ipcMain } = require('electron');
const fileUrl = require('file-url');
const BrowserLikeWindow = require('../index');

const yargs = require("yargs");
const { createPublicClient, http } = require('viem');
const web3Chains = require('viem/chains');
const { fetch } = require("undici");
global.fetch = fetch;
const fs = require('fs')
var mime = require('mime-types')

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


//
// Main electron lifecycle
//

function createWindow() {
  browser = new BrowserLikeWindow({
    controlHeight: 99,
    controlPanel: fileUrl(`${__dirname}/renderer/control.html`),
    startPage: args._.length == 1 ? args._[0] : 'evm://0xF311246e34cC59AdfaB6b9E486d18f67FB8C3e51.5/call/indexHTML(uint256)?arg=1',
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

app.on('ready', async () => {
  registerEvmProtocol();
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


//
// evm:// support
//

// Expose a JS file to inject in pages, that will populate window.ethereum with
// https://github.com/floating/eth-provider, allowing the webpages to connect
// to the Frame.sh wallet or local ethereum nodes, using the standard EIP-1193 way
ipcMain.handle('getEthProviderJs', () => 
    fs.readFileSync(`${__dirname}/../dist/eth-provider-injected.packed.js`).toString()
)

// // Register the evm protocol as priviledged (authorize the fetch API)
// protocol.registerSchemesAsPrivileged([
//   { scheme: 'evm', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, bypassCSP: true, corsEnabled: true } }
// ])

// Register and handle the evm:// protocol
function registerEvmProtocol() {
  // Register protocol
  let result = protocol.registerStringProtocol("evm", async (request, callback) => {

    let url = new URL(request.url);

    // Contract name && chain : "<contractAddress>.<chainId>"
    // Web3 network : if provided in the URL, use it, or mainnet by default
    let web3Url = null;
    let web3Chain = "mainnet";
    let contractAddress = "";
    let hostnameParts = url.hostname.split(".");
    // Was the network id specified?
    if(hostnameParts.length > 1 && parseInt(hostnameParts[hostnameParts.length - 1]) !== Number.NaN) {
      let web3ChainId = parseInt(hostnameParts[hostnameParts.length - 1]);
      if(web3ChainId && Object.entries(web3Chains).filter(chain => chain[1].id == web3ChainId).length == 1) {
        web3Chain = Object.entries(web3Chains).filter(chain => chain[1].id == web3ChainId)[0][0];
        hostnameParts.pop()
      }
    }
    // Build back the address (which can be ENS)
    contractAddress = hostnameParts.join('.');
    // If the network was specified by CLI:
    // The requested chain in the URL must match the one from the CLI
    if(args.web3Chain) {
      if(args.web3Chain != web3Chain) {
        let output = '<html><head><meta charset="utf-8" /></head><body>The requested chain is ' + web3Chain + ' but the browser was started with the chain forced to ' + args.web3Chain + '</body></html>';
        callback({ mimeType: 'text/html', data: output })
        return;
      }

      web3Url = args.web3Url
      web3Chain = args.web3Chain ? args.web3Chain : "mainnet";
    }

    // Prepare the web3 client
    const client = createPublicClient({
      chain: web3Chains[web3Chain],
      transport: http(web3Url),
    });

    // Contract address / ENS
    if(contractAddress.endsWith('.eth')) {
      let contractEnsName = contractAddress;
      contractAddress = await client.getEnsAddress({ name: contractEnsName });
      if(contractAddress == "0x0000000000000000000000000000000000000000") {
        let output = '<html><head><meta charset="utf-8" /></head><body>Failed to resolve ENS ' + contractEnsName + '</body></html>';
        callback({ mimeType: 'text/html', data: output })
        return;
      }
    }

    // Contract method && args && result
    // 2 modes :
    // - low-level : support calling all the contracts
    //   /call/:contractMethod(:argType,:arg2Type)(,,:resultType).:extension?arg=:firstArg&arg=:secondArg
    // - standard : the contract implements an interface for a simplitied URL
    //   /<path>?<arg1Name>=<argValue>&...
    let contractMethodName = '';
    let contractMethodArgsDef = [];
    let contractMethodArgs = [];
    let contractReturnDataTypes = [{type: 'string'}];
    let contractReturnMimeType = 'text/html';

    let elements = url.pathname.match(/^(?<lowlevel>\/call)?\/(?<method>[^?.()]+)(?:\((?<args>[^)]+)\))?(?:\((?<return>[^)]+)\))?(?:\.(?<extension>[a-z]+))?$/)

    // For now, we only support the low-level mode
    if(elements.groups.lowlevel === undefined) {
      let output = '<html><head><meta charset="utf-8" /></head><body>Only the low-level mode of the evm:// protocol is implemented for now.</body></html>';
      callback({ mimeType: 'text/html', data: output })
      return;
    }

    contractMethodName = elements.groups.method;

    let argsNaming = [];
    if(elements.groups.args) {
      argsNaming = elements.groups.args.split(',').map(arg => decodeURI(arg).trim().replace(/ +/g, " ").split(" "));
      contractMethodArgsDef = argsNaming.map(argNaming => ({type: argNaming[0]}))
    }

    // All the params must be provided
    if(contractMethodArgsDef.length != Array.from(url.searchParams.values()).length) {
      let output = '<html><head><meta charset="utf-8" /></head><body>In low-level mode of the evm:// protocol, all arguments must be provided</body></html>';
      callback({ mimeType: 'text/html', data: output })
      return;
    }

    contractMethodArgs = argsNaming.map((argNaming, argId) => 
      // If named, find by name, otherwise take by index
      (argNaming.length == 2) ? url.searchParams.get(argNaming[1]) : Array.from(url.searchParams.values())[argId]
    )

    if(elements.groups.return) {
      contractReturnDataTypes = elements.groups.return.split(',').map(returnType => decodeURI(returnType).trim().replace(/ +/g, " ")).map(returnType => ({type: returnType}))
    }

    if(elements.groups.extension) {
      contractReturnMimeType = mime.lookup(elements.groups.extension);
      if(contractReturnMimeType == false) {
        let output = '<html><head><meta charset="utf-8" /></head><body>Unrecognized extension</body></html>';
        callback({ mimeType: 'text/html', data: output })
        return;
      }
    }


    // Contract definition
    let abi = [
      {
        inputs: contractMethodArgsDef,
        name: contractMethodName,
        // Assuming string output
        outputs: contractReturnDataTypes,
        stateMutability: 'view',
        type: 'function',
      },
    ];
    let contract = {
      address: contractAddress,
      abi: abi,
    };


    // Make the call!
    let output = "";
    try {
      output = await client.readContract({
        ...contract,
        functionName: contractMethodName,
        args: contractMethodArgs,
      })
    }
    catch(err) {
      output = '<html><head><meta charset="utf-8" /></head><body><pre>' + err.toString() + '</pre></body></html>';
      callback({ mimeType: 'text/html', data: output })
      return;
    }

    // If we specified multiple return data types, we want the last
    if(contractReturnDataTypes.length > 1) {
      output = output[contractReturnDataTypes.length - 1]
    }

    callback({ mimeType: contractReturnMimeType, data: "" + output })
  })

  console.log('EVM protocol registered: ', result)
}