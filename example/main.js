const { app, protocol } = require('electron');
const fileUrl = require('file-url');
const BrowserLikeWindow = require('../index');
const yargs = require("yargs");

const { createPublicClient, http } = require('viem');
const web3Chains = require('viem/chains');
const { fetch } = require("undici");
global.fetch = fetch;

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
  });

  browser.on('closed', () => {
    browser = null;
  });
}


// // Register the evm protocol as priviledged (authorize the fetch API)
// protocol.registerSchemesAsPrivileged([
//   { scheme: 'evm', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, bypassCSP: true, corsEnabled: true } }
// ])


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


function registerEvmProtocol() {
  // Register protocol
  let result = protocol.registerStringProtocol("evm", async (request, callback) => {

    let url = new URL(request.url);

    // Web3 network : if provided in the URL, use it, or mainnet by default
    let web3Chain = "mainnet";
    let web3Url = null;
    if(url.username && web3Chains[url.username] !== undefined) {
      web3Chain = url.username;
    }
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
    let contractAddress = url.hostname;
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
    // - raw : support calling all the contracts
    //   /raw/<contractMethod>?<arg1Name>:<dataType>=<argValue>[&...][&result=<dataType>[;<mimeType>]]
    // - standard : the contract implements an interface for a simplitied URL
    //   /<path>?<arg1Name>=<argValue>&...
    let contractMethodName = url.pathname.substring(1);
    let contractMethodArgsDef = [];
    let contractMethodArgs = [];
    let contractMethodNameParts = contractMethodName.split("/");
    let contractReturnDataType = 'string';
    let contractReturnMimeType = 'text/html';
    // For now, we only support the raw mode
    if(contractMethodNameParts[0] != "raw") {
      let output = '<html><head><meta charset="utf-8" /></head><body>Only the raw mode of the evm:// protocol is implemented for now.</body></html>';
      callback({ mimeType: 'text/html', data: output })
      return;
    }
    contractMethodName = contractMethodNameParts[1];
    url.searchParams.forEach((argValue, key) => {
      // Special case : "result"
      if(key == "result") {
        let [argReturnDataType, argReturnMimeType] = argValue.split(';')
        if(argReturnDataType) {
          contractReturnDataType = argReturnDataType;
        }
        if(argReturnMimeType) {
          contractReturnMimeType = argReturnMimeType;
        }
        return;
      }

      let [argName, argType] = key.split(':');

      contractMethodArgsDef.push({
        name: argName,
        type: argType
      })
      contractMethodArgs.push(argValue)
    })

    // Contract definition
    let contract = {
      address: contractAddress,
      abi: [
        {
          inputs: contractMethodArgsDef,
          name: contractMethodName,
          // Assuming string output
          outputs: [{ name: '', type: contractReturnDataType }],
          stateMutability: 'view',
          type: 'function',
        },
      ],
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

    callback({ mimeType: contractReturnMimeType, data: output })
  })

  console.log('EVM protocol registered: ', result)
}