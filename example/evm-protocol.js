const { protocol } = require('electron');
const { createPublicClient, http, decodeAbiParameters } = require('viem');
const mime = require('mime-types')

//
// evm:// support ; created before EIP-4804 was discovered, to be removed soon
//

// Register and handle the evm:// protocol
const registerEvmProtocol = (web3Chains) => {
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

  console.log('Evm protocol registered: ', result)
}

module.exports = { registerEvmProtocol }