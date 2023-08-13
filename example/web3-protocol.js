const { protocol } = require('electron');
const { PassThrough } = require('stream')

const { parseUrl, fetchParsedUrl } = require('web3protocol');

//
// EIP-4808 web3:// protocol
//

const registerWeb3Protocol = (web3ChainOverrides) => {


  let result = protocol.registerStreamProtocol("web3", async (request, callback) => {
    let debuggingHeaders = {}

    try {
      // web3protocol options : chain overrides
      let opts = {
        chains: web3ChainOverrides
      }

      // Parse the web3:// URL
      let parsedUrl = await parseUrl(request.url, opts)

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
        debuggingHeaders['web3-auto-method-arg-values'] = JSON.stringify(parsedUrl.methodArgValues)
        debuggingHeaders['web3-auto-method-return'] = JSON.stringify(parsedUrl.methodReturn)
      }

      // Make the call
      let callResult = await fetchParsedUrl(parsedUrl, opts)

      // Convert the output to a stream
      const stream = new PassThrough()
      stream.push(callResult.output)
      stream.push(null)

      // Send to the browser
      callback({ 
        statusCode: callResult.httpCode, 
        data: stream,
        headers: Object.assign({}, callResult.httpHeaders, debuggingHeaders) })
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

module.exports = { registerWeb3Protocol }