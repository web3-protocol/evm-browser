const { ipcRenderer } = require('electron')

window.onload = async function() {
    // Fetch the JS of eth-provider being exposed on window.ethereum
    // (Cannot use file reading here)
    let webpackedScript = await ipcRenderer.invoke('getEthProviderJs')

    // Inject it in document
    var script = document.createElement("script");
    var scriptText=document.createTextNode(webpackedScript)
    script.appendChild(scriptText);
    document.body.appendChild(script);
};