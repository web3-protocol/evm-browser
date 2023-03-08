# evm-browser

Browser with support of the `evm://` protocol scheme, which allow you to display the contents returned by EVM contracts from any EVM chain (ethereum mainnet by default).
Forked from the great [electron-as-browser](https://github.com/hulufei/electron-as-browser) from hulufei. Experimental!

`evm://<contractAddress>/<contractMethod>?<arg1Name>:<arg1Type>=<argValue>&...`

Example : 

`evm://0x4e1f41613c9084fdb9e34e11fae9412427480e56/tokenHTML?tokenId:uint256=4197`

will load the tokenHTML method of the Terraform contract, asking for #4197

![./screenshot2.png](./screenshot2.png)

Since `evm://` is supported at the browser level, alls links, XHR fetchs will work.

## Install

`yarn install`

`yarn start:control`

## Usage

`yarn start`

Use your own web3 provider : `yarn start --web3-url https://eth-mainnet.alchemyapi.io/v2/xxxxxx`

Use your local evm node : `yarn start --web3-url http://127.0.0.1:8545`


