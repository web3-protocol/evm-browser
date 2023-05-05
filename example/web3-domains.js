
const { stringToHex } = require('viem');

const linagee = {
    address :"0x6023E55814DC00F094386d4eb7e17Ce49ab1A190",
    abi: [{
          "inputs": [ {"internalType": "bytes32","name": "_name","type": "bytes32"},
                      {"internalType": "string","name": "_key","type": "string"}],
          "name": "getTextRecord",
          "outputs": [{"internalType": "string","name": "","type": "string"}],
          "stateMutability": "view",
          "type": "function"},
          {
            "inputs": [{ "internalType": "string", "name": "_domain", "type": "string"}],
            "name": "resolve",
            "outputs": [{ "internalType": "address", "name": "", "type": "address"}],
            "stateMutability": "view",
            "type": "function"
    }],
    domainAsBytes32(domainName){
        // og domains are stored in a bytes32
        if(domainName.length > 35)
            throw new Error("Domain too long (32 bytes max for .og");
        //og names must be converted from a string into a bytes hex string without og on the end
        let domainBytes32 = stringToHex(domainName.slice(0,-3), {size: 32});
        // pad the string properly
        while (domainBytes32.length < 66) {
            domainBytes32 += '0';
        }
        return domainBytes32;
    }
}

exports.linagee = linagee;
