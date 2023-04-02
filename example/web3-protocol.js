const { protocol } = require('electron');
const { createPublicClient, http, decodeAbiParameters } = require('viem');
const { normalize: ensNormalize } = require('viem/ens')
const mime = require('mime-types')

//
// EIP-4808 web3:// protocol
//

const registerWeb3Protocol = (web3Chains) => {

  //
  // Domain name handling
  // Assumption : all domain names are resolving on ethereum mainnet
  //

  // Is it a supported domain name? (ENS, ...)
  const isSupportedDomainName = (domainName) => {
    return typeof domainName == 'string' && domainName.endsWith('.eth');
  }

  // A mainnet client only for domain name resolution
  const domainNameResolutionClient = createPublicClient({ 
    chain: web3Chains.mainnet,
    transport: http()
  })
  // Attempt resolution of the domain name
  // Must return an exception if failure
  const resolveDomainName = async (domainName) => {
    // ENS
    if(domainName.endsWith('.eth')) {
      let address = await domainNameResolutionClient.getEnsAddress({ name: ensNormalize(domainName) });
      if(address == "0x0000000000000000000000000000000000000000") {
        throw new Error("Unable to resolve the argument as an ethereum .eth address")
      }
      return address;
    }

    throw new Error('Unrecognized domain name : ' + domainName)
  }

  // Follow EIP-4804 standard : if there is a web3 TXT record with a EIP-3770 address, 
  // then go there. Otherwise, go to the resolved address.
  const resolveDomainNameForEIP4804 = async (domainName) => {
    // TODO : fetch TXT record. Pull request incoming on viem.sh (not from me)

    // TODO : Returns 2 arguments : address and chain id to switch to.
    // Awaiting clarification from Qi Zhou

    // Default : return resolved domain name
    return resolveDomainName(domainName);
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
          if(isSupportedDomainName(x)) {
            // Will throw an error if failure
            let xAddress = await resolveDomainName(x);
            return xAddress;
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
    if(isNaN(parseInt(url.port)) == false) {
      let web3ChainId = parseInt(url.port);
      if(web3ChainId && Object.entries(web3Chains).filter(chain => chain[1].id == web3ChainId).length == 1) {
        web3Chain = Object.entries(web3Chains).filter(chain => chain[1].id == web3ChainId)[0][0];
      }
    }

    // Prepare the web3 client
    const client = createPublicClient({
      chain: web3Chains[web3Chain],
      transport: http(web3ProviderUrl),
    });

    // Contract address / ENS
    let contractAddress = url.hostname;
    if(isSupportedDomainName(contractAddress)) {
      try {
        contractAddress = await resolveDomainNameForEIP4804(contractAddress)
      }
      catch(err) {
        let output = '<html><head><meta charset="utf-8" /></head><body>Failed to resolve domain name ' + contractAddress + '</body></html>';
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

module.exports = { registerWeb3Protocol }