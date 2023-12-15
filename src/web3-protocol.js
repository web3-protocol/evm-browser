const { protocol } = require('electron');
const { PassThrough } = require('stream');
const { Readable } = require('stream');

//
// EIP-6860 web3:// protocol
//

const registerWeb3Protocol = async (web3ChainOverrides) => {

  // Import the web3protocol (esm) the commonjs way
  const { Client } = await import('web3protocol');
  const { getDefaultChainList } = await import('web3protocol/chains');

  let result = protocol.registerStreamProtocol("web3", async (request, callback) => {
    let debuggingHeaders = {}

    // Get the default chains
    let chainList = getDefaultChainList()
    
    // Handle the overrides
    web3ChainOverrides.forEach(chainOverride => {
      // Find if the chain already exist
      let alreadyDefinedChain = Object.entries(chainList).find(chain => chain[1].id == chainOverride.id) || null

      // If it exists, override RPCs
      if(alreadyDefinedChain) {
        chainList[alreadyDefinedChain[0]].rpcUrls = [...chainOverride.rpcUrls]
      }
      // If does not exist, create it
      else {
        let newChain = {
          id: chainOverride.id,
          name: 'custom-' + chainOverride.id,
          rpcUrls: [...chainOverride.rpcUrls],
        }
        chainList.push(newChain)
      }
    })

    // Create the web3Client
    let web3Client = new Client(chainList)

    try {
      // Parse the web3:// URL
      let parsedUrl = await web3Client.parseUrl(request.url)

      // Fill the debugging headers
      if(parsedUrl.nameResolution.chainId) {
        debuggingHeaders['web3-nameservice-chainid'] = "" + parsedUrl.nameResolution.chainId;
      }
      debuggingHeaders['web3-target-chainid'] = "" + parsedUrl.chainId;
      debuggingHeaders['web3-contract-address'] = parsedUrl.contractAddress;
      debuggingHeaders['web3-resolve-mode'] = parsedUrl.mode;
      if(parsedUrl.contractCallMode == 'calldata') {
        debuggingHeaders['web3-calldata'] = parsedUrl.calldata
      }
      else if(parsedUrl.contractCallMode == 'method') {
        debuggingHeaders['web3-auto-method'] = parsedUrl.methodName
        debuggingHeaders['web3-auto-method-arg'] = JSON.stringify(parsedUrl.methodArgs)
        debuggingHeaders['web3-auto-method-arg-values'] = JSON.stringify(parsedUrl.methodArgValues, 
      (key, value) => typeof value === "bigint" ? "0x" + value.toString(16) : value)
        debuggingHeaders['web3-auto-method-return'] = JSON.stringify(parsedUrl.methodReturn)
      }

      // Make the call
      let contractReturn = await web3Client.fetchContractReturn(parsedUrl)
      let callResult = await web3Client.processContractReturn(parsedUrl, contractReturn)

      // Send to the browser
      callback({ 
        statusCode: callResult.httpCode, 
        data: new JavaScriptToNodeReadable(callResult.output),
        headers: Object.assign({}, callResult.httpHeaders, debuggingHeaders) 
      })
      return;
    }
    catch(err) {
      displayError(err.toString(), callback, debuggingHeaders)
      return;
    }
  })


  //
  // Utilities
  //

  // Display an error on the browser. callbackFunction is the callback from registerStreamProtocol
  const displayError = (errorText, callbackFunction, debuggingHeaders) => {
    output = '<html><head><meta charset="utf-8" /></head><body><pre>' + errorText + '</pre></body></html>';

    const stream = new PassThrough()
    stream.push(output)
    stream.push(null)

    callbackFunction({ 
      statusCode: 500, 
      mimeType: 'text/html', 
      data: stream,
      headers: debuggingHeaders })
  }

  console.log('Web3 protocol registered: ', result)
}

// Create a Node.js ReadableStream from a JS ReadableStream
class JavaScriptToNodeReadable extends Readable {
  constructor(jsReadableStream, options) {
    super(options);
    this.reader = jsReadableStream.getReader();
  }

  // Implement the _read method to fulfill the ReadableStream contract
  _read() {
    // Use the reader from the browser-based ReadableStream to read chunks
    this.reader.read().then(({ done, value }) => {
      if (done) {
        this.push(null);
      } else {
        this.push(value);
      }
    }).catch((error) => {
      this.emit('error', error);
    });
  }
}


module.exports = { registerWeb3Protocol }