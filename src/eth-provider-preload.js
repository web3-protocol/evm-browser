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

    // When loading an url returning a header "content-type: application/json", 
    // electron generate some HTML to render the JSON. It includes 
    // "<meta name="color-scheme" content="light dark">" which has the weird effect of
    // making text white if the OS color scheme is dark.
    // Workaround : In dark mode, in <pre> tags (let's limit side effects), put back text as dark
    // This should no affect normal pages, as by default text is dark even with OS color scheme being dark
    document.head.insertAdjacentHTML("afterbegin", `<style>@media (prefers-color-scheme: dark) {pre {color: black}}</style>`)
};