# evm-browser

Browser with support of a new proposed `evm://` protocol scheme, which allow you to display the contents returned by EVM contracts from any EVM chain.
Forked from the great [electron-as-browser](https://github.com/hulufei/electron-as-browser) from hulufei. Experimental!

Example : 

``evm://0xD3a0d2CEc61014A323C216dEDd133F977496971f.5/call/indexHTML(uint256)?arg=1``

will load a goerli proof-of-concept "on-chain website" served by a smart contract and interacting with Terraforms (see contract on [etherscan](https://goerli.etherscan.io/address/0x189a38638F84Cc8450D09B75b417657B70bff2A4#code))

![./screenshot2.png](./screenshot2.png)

Since `evm://` is supported at the browser level, alls links, XHR fetchs will work. (Note: fetch() support not yet activated)

## evm:// protocol

I see 2 modes of usage : a mode which work for all contracts, but end up with cumbersome URLs (the "raw") mode, and a mode in which the contract implements an interface to allow more concise URLs.

Raw mode, implemented -- still moving parts:

`evm://<contractAddress>[.<networkId>]/call/<contractMethod>(<argsType>)(<resultType>)<extension>?arg=<argValue>[&...]`

"Standard" mode, not implemented, with an interface to implement, to be defined:

``evm://<contractAddress>[.<networkId>]/<path>?<arg1Name>=<argValue>[&...]``

### Working examples

`evm://0x5a985f13345e820aa9618826b85f74c3986e1463.5/call/tokenSVG(uint256).svg?arg=2`

Will call the tokenSVG method of the terraform contract located on goerli (chain id 5), ask for tokenId 2 and cast the result as image/svg+xml. This use unnamed parameters.

`evm://0x4e1f41613c9084fdb9e34e11fae9412427480e56/call/tokenHTML(uint256 tokenId)?tokenId=4197`

Will call the tokenHTML method of the terraform contract on mainnet, ask for tokenId 4197 and display its HTML. This use named parameters.

`evm://0xA5aFC9fE76a28fB12C60954Ed6e2e5f8ceF64Ff2/call/levelAndTile(uint256,uint256)(uint256,uint256).txt?arg=2&arg=50`

This call the levelAndTile method of the TerraformsData contract, which have 2 uint as arguments. This returns 2 uints, we display the second. And we display as text.

## Wallet support

evm-browser also ships with [Frame.sh](https://frame.sh/) wallet and local node wallet support, which allows us to have a full read+write experience!

This is thanks to [eth-provider](https://github.com/floating/eth-provider), which is exposed on ``window.ethereum``

## Install

`yarn install`

`yarn start:setup`

## Usage

`yarn start`

Use your own web3 provider : `yarn start --web3-url https://eth-mainnet.alchemyapi.io/v2/xxxxxx`

Use your local evm node : `yarn start --web3-url http://127.0.0.1:8545`



