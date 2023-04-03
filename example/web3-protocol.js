const { protocol } = require('electron');
const { createPublicClient, http, decodeAbiParameters } = require('viem');
const { normalize: ensNormalize } = require('viem/ens')
const mime = require('mime-types')
// We need that only for the short-name -> id mapping, for the resolution of EIP-3770 address
// const {chains: ethChainsPkgWeb3Chains } = require('eth-chains')
// Temporary until the above package has auto-update activated (looks like it is coming very soon)
const chainsJsonFileChans = require('./web3-chains.js')

//
// EIP-4808 web3:// protocol
//

const registerWeb3Protocol = (web3Chains) => {

  //
  // Domain name handling
  // Assumption : all domain names are resolving on ethereum mainnet
  //

  // Is it a supported domain name? (ENS, ...)
  const isSupportedDomainName = (domainName, web3chain) => {
    return typeof domainName == 'string' && 
      // ENS is supported on mainnet, goerli and sepolia
      domainName.endsWith('.eth') && [1, 5, 11155111].includes(web3chain.id);
  }

  // Attempt resolution of the domain name
  // Must return an exception if failure
  const resolveDomainName = async (domainName, web3Client) => {
    // ENS
    if(domainName.endsWith('.eth')) {
      let address = await web3Client.getEnsAddress({ name: ensNormalize(domainName) });
      if(address == "0x0000000000000000000000000000000000000000") {
        throw new Error("Unable to resolve the argument as an ethereum .eth address")
      }
      return address;
    }

    throw new Error('Unrecognized domain name : ' + domainName)
  }

  // Follow EIP-4804 standard : if there is a web3 TXT record with a common or EIP-3770 address, 
  // then go there. Otherwise, go to the resolved address.
  const resolveDomainNameForEIP4804 = async (domainName, web3Client) => {
    let result = {
      address: null,
      chainId: null,
    };

    // ENS
    if(domainName.endsWith('.eth')) {
      // Get the web3 TXT record
      const web3Txt = await web3Client.getEnsText({
        name: ensNormalize(domainName),
        key: 'web3',
      })

      // web3 TXT case
      if(web3Txt) {
        let web3TxtParts = web3Txt.split(':');
        // Simple address?
        if(web3TxtParts.length == 1) {
          if(/^0x[0-9a-fA-F]{40}/.test(web3Txt) == false) {
            throw new Error("Invalid address in web3 TXT record")
          }
          result.address = web3Txt;
        }
        // EIP-3770 address
        else if(web3TxtParts.length == 2) {
          // Search the chain by its chain short name
          let chainByShortName = Object.values(chainsJsonFileChans).find(chain => chain.shortName == web3TxtParts[0]) || null
          if(chainByShortName == null) {
            throw new Error("The chain short name of the web3 TXT record was not found")
          }
          if(/^0x[0-9a-fA-F]{40}/.test(web3TxtParts[1]) == false) {
            throw new Error("Invalid address in web3 TXT record")
          }
          result.chainId = chainByShortName.chainId
          result.address = web3TxtParts[1]
        }
        // Mistake
        else {
          throw new Error("Invalid address in web3 TXT record")
        }
      }
      // No web3 TXT
      else {
        result.address = await resolveDomainName(domainName, web3Client);
      }
    }
    // All other domains
    else {
      result.address = await resolveDomainName(domainName, web3Client);
    }

    return result;
  }


  //
  // web3:// call handling
  //

  let result = protocol.registerStringProtocol("web3", async (request, callback) => {
    // The supported types in arguments
    let supportedTypes = [
      {
        type: 'uint256',
        autoDetectable: true,
        parse: async (x, web3Client) => {
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
        parse: async (x, web3Client) => {
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
        parse: async (x, web3Client) => {
          if(x.length == 22 && x.substr(0, 2) == '0x') {
            return x;
          }
          if(isSupportedDomainName(x, web3Client.chain)) {
            // Will throw an error if failure
            let xAddress = await resolveDomainName(x, web3Client);
            return xAddress;
          }

          throw new Error("Unrecognized address")
        }
      },
      {
        type: 'bytes',
        autoDetectable: false,
        parse: async (x, web3Client) => x,
      },
      {
        type: 'string',
        autoDetectable: false,
        parse: async (x, web3Client) => x,
      },
    ];


    let url = new URL(request.url);

    // Web3 network : if provided in the URL, use it, or mainnet by default
    let web3chain = web3Chains["mainnet"];
    // Was the network id specified?
    if(isNaN(parseInt(url.port)) == false) {
      let web3ChainId = parseInt(url.port);
      // Find the matching chain
      web3chain = Object.values(web3Chains).find(chain => chain.id == web3ChainId)
      if(web3chain == null) {
        let output = '<html><head><meta charset="utf-8" /></head><body>No chain found for id ' + web3ChainId + '</body></html>';
        callback({ mimeType: 'text/html', data: output })
        return;        
      }
    }
    

    // Prepare the web3 client
    let web3Client = createPublicClient({
      chain: web3chain,
      transport: http(),
    });

    // Contract address / Domain name
    let contractAddress = url.hostname;
    // If not looking like an address...
    if(/^0x[0-9a-fA-F]{40}/.test(contractAddress) == false) {
      if(isSupportedDomainName(contractAddress, web3chain)) {
        let resolutionInfos = null
        try {
          resolutionInfos = await resolveDomainNameForEIP4804(contractAddress, web3Client)
        }
        catch(err) {
          let output = '<html><head><meta charset="utf-8" /></head><body>Failed to resolve domain name ' + contractAddress + '</body></html>';
          callback({ mimeType: 'text/html', data: output })
          return;
        }

        // Set contract address
        contractAddress = resolutionInfos.address
        // We got an address on another chain? Update the web3Client
        if(resolutionInfos.chainId) {
          web3chain = Object.values(web3Chains).find(chain => chain.id == resolutionInfos.chainId)
          web3Client = createPublicClient({
            chain: web3chain,
            transport: http(),
          });
        }
      }
      // Domain name not supported in this chain
      else {
        let output = '<html><head><meta charset="utf-8" /></head><body>Unresolvable domain name : ' + contractAddress + ' : no supported resolvers found in this chain</body></html>';
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

    // If we have a web3 url without the initial "/", add it
    // That is the behavior of browsers
    if (url.pathname == "") {
      url.pathname = "/"
    }

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
      let resolveMode = await web3Client.readContract({
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
        let rawOutput = await web3Client.call({
          to: contractAddress,
          data: "0x" + Buffer.from(callData).toString('hex')
        })

        // Looks like this is what happens when calling non-contracts
        if(rawOutput.data === undefined) {
          throw new Error("Looks like the address is not a contract.");
        }

        rawOutput = decodeAbiParameters([
            { type: 'bytes' },
          ],
          rawOutput.data,
        )

        output = Buffer.from(rawOutput[0].substr(2), "hex").toString().replace(/\0/g, '');
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
              argValue = await supportedTypes[j].parse(argValue, web3Client)
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
                argValue = await supportedTypes[j].parse(argValue, web3Client)
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
        output = await web3Client.readContract({
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

module.exports = { registerWeb3Protocol }