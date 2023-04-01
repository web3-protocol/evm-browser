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

app.on('ready', async () => {
  registerWeb3Protocol();
  // To be removed later
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



// Register the evm protocol as priviledged (authorize the fetch API)
// Must be done before the app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'web3', privileges: { supportFetchAPI: true } },
  { scheme: 'evm', privileges: { supportFetchAPI: true } }
])


//
// web3:// support (EIP-4804)
//

// Register and handle the evm:// protocol
function registerWeb3Protocol() {
  // Register protocol
  let result = protocol.registerStringProtocol("web3", async (request, callback) => {
    // The supported types in arguments
    let supportedTypes = [
      {
        type: 'uint256',
        autoDetectable: true,
        parse: async (x) => {
          x = parseInt(x)
          if(isNaN(x)) {
            throw new Error("Number is not parseable")
          }
          if(x < 0) {
            throw new Error("Number must be positive")
          }
          return x
        },
      },
      {
        type: 'bytes32',
        autoDetectable: true,
        parse: async (x) => {
          if(x.length != 34) {
            throw new Error("Bad length (must include 0x in front)")
          }
          if(x.substr(0, 2) != '0x') {
            throw new Error("Must start with 0x")
          }
          return x
        }
      }, 
      {
        type: 'address',
        autoDetectable: true,
        parse: async (x) => {
          if(x.length == 22 && x.substr(0, 2) == '0x') {
            return x;
          }
          if(x.endsWith('.eth')) {
            let xAddress = await client.getEnsAddress({ name: x });
            if(xAddress == "0x0000000000000000000000000000000000000000") {
              throw new Error("Unable to resolve the argument as an ethereum .eth address")
            }
            return xAddress
          }

          throw new Error("Unrecognized address")
        }
      },
      {
        type: 'bytes',
        autoDetectable: false,
        parse: async (x) => x,
      },
      {
        type: 'string',
        autoDetectable: false,
        parse: async (x) => x,
      },
    ];


    let url = new URL(request.url);

    // Web3 network : if provided in the URL, use it, or mainnet by default
    let web3ProviderUrl = null;
    let web3Chain = "mainnet";    
    // Was the network id specified?
    if(parseInt(url.port) !== Number.NaN) {
      let web3ChainId = parseInt(url.port);
      if(web3ChainId && Object.entries(web3Chains).filter(chain => chain[1].id == web3ChainId).length == 1) {
        web3Chain = Object.entries(web3Chains).filter(chain => chain[1].id == web3ChainId)[0][0];
      }
    }
    // If the network was specified by CLI:
    // The requested chain in the URL must match the one from the CLI
    if(args.web3Chain) {
      if(args.web3Chain != web3Chain) {
        let output = '<html><head><meta charset="utf-8" /></head><body>The requested chain is ' + web3Chain + ' but the browser was started with the chain forced to ' + args.web3Chain + '</body></html>';
        callback({ mimeType: 'text/html', data: output })
        return;
      }

      web3ProviderUrl = args.web3Url
      web3Chain = args.web3Chain ? args.web3Chain : "mainnet";
    }

    // Prepare the web3 client
    const client = createPublicClient({
      chain: web3Chains[web3Chain],
      transport: http(web3ProviderUrl),
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
    // - Auto : we parse the path and arguments and send them
    // - Manual : we forward all the path & arguments as calldata
    let contractMode = 'auto'
    let contractReturnDataTypes = [{type: 'string'}];
    let contractReturnMimeType = 'text/html';
    let contractReturnJsonEncode = false;
    let output = '';

    let pathnameParts = url.pathname.split('/')

    // If the last pathname part contains a dot, assume an extension
    // Try to extract the mime type
    if(pathnameParts.length >= 2) {
      let argValueParts = pathnameParts[pathnameParts.length - 1].split('.')
      if(argValueParts.length > 1) {
        let mimeType = mime.lookup(argValueParts[argValueParts.length - 1])
        if(mimeType != false) {
          contractReturnMimeType = mimeType
          pathnameParts[pathnameParts.length - 1] = argValueParts.slice(0, -1).join('.')
        }
      }
    }

    // Detect if the contract is manual mode : resolveMode must returns "manual"
    try {
      let resolveMode = await client.readContract({
        address: contractAddress,
        abi: [{
          inputs: [],
          name: 'resolveMode',
          outputs: [{type: 'bytes32'}],
          stateMutability: 'view',
          type: 'function',
        }],
        functionName: 'resolveMode',
        args: [],
      })
      let resolveModeAsString = Buffer.from(resolveMode.substr(2), "hex").toString().replace(/\0/g, '');
      if(resolveModeAsString == "manual") {
        contractMode = 'manual';
      }
    }
    catch(err) {}
    // Detect if the call to the auto contract is manual : if only "/" is called
    if(contractMode == "auto" && pathnameParts[1] == "") {
      contractMode = "manual";
    }


    // Process a manual mode call
    if(contractMode == 'manual') {
      let callData = url.pathname + (Array.from(url.searchParams.values()).length > 0 ? "?" + url.searchParams : "");
      try {
        let rawOutput = await client.call({
          to: contractAddress,
          data: "0x" + Buffer.from(callData).toString('hex')
        })
        output = Buffer.from(rawOutput.data.substr(2), "hex").toString().replace(/\0/g, '');
      }
      catch(err) {
        output = '<html><head><meta charset="utf-8" /></head><body><pre>' + err.toString() + '</pre></body></html>';
        callback({ mimeType: 'text/html', data: output })
        return;
      }
    }
    // Process a auto mode call
    else {
      let contractMethodName = '';
      let contractMethodArgsDef = [];
      let contractMethodArgs = [];

      contractMethodName = pathnameParts[1];

      pathnameParts = pathnameParts.slice(2)
      for(let i = 0; i < pathnameParts.length; i++) {
        let argValue = pathnameParts[i]
        let detectedType = null;

        // First we look for an explicit cast
        for(j = 0; j < supportedTypes.length; j++) {
          if(argValue.startsWith(supportedTypes[j].type + '!')) {
            argValue = argValue.split('!').slice(1).join('!')
            try {
              argValue = await supportedTypes[j].parse(argValue)
            }
            catch(e) {
              output = '<html><head><meta charset="utf-8" /></head><body>Argument ' + i + ' was explicitely requested to be casted to ' + supportedTypes[j].type + ', but : ' + e + '</body></html>';
              callback({ mimeType: 'text/html', data: output })
              return;
            }
            detectedType = supportedTypes[j].type
            break;
          }
        }

        // Next, if no explicit cast, try to detect
        if(detectedType == null) {
          for(j = 0; j < supportedTypes.length; j++) {
            if(supportedTypes[j].autoDetectable) {
              try {
                argValue = await supportedTypes[j].parse(argValue)
                detectedType = supportedTypes[j].type

                break
              }
              catch(e) {
              }
            }
          }
        }

        // Finally, save the args and its type
        contractMethodArgsDef.push({type: detectedType ? detectedType : "bytes"})
        contractMethodArgs.push(argValue)
      }

      // Handle the return definition
      let returnsParam = url.searchParams.get('returns')
      if(returnsParam && returnsParam.length >= 2) {
        // When we have a return definition, we returns everything as JSON
        contractReturnJsonEncode = true;

        returnsParamParts = returnsParam.substr(1, returnsParam.length - 2).split(',').map(returnType => returnType.trim()).filter(x => x != '')

        if(returnsParamParts == 0) {
          contractReturnDataTypes = [{type: 'bytes'}]
        }
        else {
          contractReturnDataTypes = []
          for(let i = 0; i < returnsParamParts.length; i++) {
            contractReturnDataTypes.push({type: returnsParamParts[i]})
          }
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
    }




    // Cast as json if requested
    if(contractReturnJsonEncode) {
      contractReturnMimeType = 'application/json'
      if((output instanceof Array) == false) {
        output = [output]
      }
      output = JSON.stringify(output.map(x => "" + x))
    }
    // Default : Cast as string
    else {
      output = "" + output;
    }

    callback({ mimeType: contractReturnMimeType, data: output })
  })

  console.log('Web3 protocol registered: ', result)
}


//
// evm:// support
//

// Register and handle the evm:// protocol
function registerEvmProtocol() {
  // Register protocol
  let result = protocol.registerStringProtocol("evm", async (request, callback) => {

    let url = new URL(request.url);

    // Contract name && chain : "<contractAddress>.<chainId>"
    // Web3 network : if provided in the URL, use it, or mainnet by default
    let web3ProviderUrl = null;
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

      web3ProviderUrl = args.web3Url
      web3Chain = args.web3Chain ? args.web3Chain : "mainnet";
    }

    // Prepare the web3 client
    const client = createPublicClient({
      chain: web3Chains[web3Chain],
      transport: http(web3ProviderUrl),
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