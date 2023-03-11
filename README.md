# evm-browser

Browser with support of the `evm://` protocol scheme, which allow you to display the contents returned by EVM contracts from any EVM chain (ethereum mainnet by default).
Forked from the great [electron-as-browser](https://github.com/hulufei/electron-as-browser) from hulufei. Experimental!

Example : 

``evm://goerli@0xC4ed287A36d9be107C31b1FeD2302b831eCB066c/raw/indexHTML?pageNumber:uint256=1``

will load a proof-of-concept "on-chain website" interacting with Terraforms (see contract on [etherscan](https://goerli.etherscan.io/address/0xC4ed287A36d9be107C31b1FeD2302b831eCB066c#code))

![./screenshot2.png](./screenshot2.png)

Since `evm://` is supported at the browser level, alls links, XHR fetchs will work. (Note: fetch() support not yet activated)

## evm:// protocol

I see 2 modes of usage : a mode which work for all contracts, but end up with cumbersome URLs (the "raw") mode, and a mode in which the contract implements an interface to allow more concise URLs.

Raw mode, implemented:

`evm://[<networkName>@]<contractAddress>/raw/<contractMethod>?<arg1Name>:<dataType>=<argValue>[&...][&result=<dataType>[;<mimeType>]]`

"Standard" mode, not implemented:

``evm://[<networkName>@]<contractAddress>/<path>?<arg1Name>=<argValue>[&...]``

## Install

`yarn install`

`yarn start:control`

## Usage

`yarn start`

Use your own web3 provider : `yarn start --web3-url https://eth-mainnet.alchemyapi.io/v2/xxxxxx`

Use your local evm node : `yarn start --web3-url http://127.0.0.1:8545`


## Examples

`evm://0x4e1f41613c9084fdb9e34e11fae9412427480e56/tokenHTML?tokenId:uint256=4197`

will load the tokenHTML method of the Terraform contract, asking for #4197
