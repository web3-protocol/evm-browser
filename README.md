# EVM Browser

Web browser with support of the [EIP-4804 `web3://` protocol](https://eips.ethereum.org/EIPS/eip-4804), which can show on-chain websites hosted on Ethereum and all others EVM chains.

![./screenshot2.png](./screenshot2.png)

As an example, ``web3://terraformnavigator.eth/`` is an on-chain website served by a [smart contract](https://etherscan.io/address/0x894ed8a11fed2cca743c78d807e75510b40eb701#code), which interacts with the [Terraform NFT contract](https://etherscan.io/address/0x4e1f41613c9084fdb9e34e11fae9412427480e56#code) : pages are generated dynamically, these are not static pages.

The browser works out of the box with all chains (providers are given by [viem.sh](https://viem.sh/) and [chainid.network](https://chainid.network/)) and support the [Frame.sh](https://frame.sh/) wallet.

ENS domain name resolution ([proposed EIP-6821](https://ethereum-magicians.org/t/eip-6821-support-ens-name-for-web3-url/13654)) happens via the declaration of a ``contentcontract`` TXT record containing a [EIP-3770 chain-specific address](https://eips.ethereum.org/EIPS/eip-3770), or, if not present, via a standard resolution.

Browser forked from the great [electron-as-browser](https://github.com/hulufei/electron-as-browser) from hulufei.

In the above example, clicking on a terraform will load a dynamic page, for example : 

``web3://terraformnavigator.eth/viewHTML/9352``

![./screenshot3.png](./screenshot3.png)

More examples : 

``web3://0xA66556f4DB239E713491859258E577f25510eFd6:5/``

Load a on-chain website on goerli (``:5`` is the chain id of goerli).

``web3://0x5a985f13345e820aa9618826b85f74c3986e1463:5/tokenHTML/2``

Call the ``tokenHTML`` method of ``0x5a985f13345e820aa9618826b85f74c3986e1463`` on goerli, and gives the uint 2 as an argument.

``web3://0x5a985f13345e820aa9618826b85f74c3986e1463:5/tokenSVG/2.svg``

Call the ``tokenSVG`` method of ``0x5a985f13345e820aa9618826b85f74c3986e1463`` on goerli, gives the uint 2 as an argument, and return the result as ``image/svg+xml``.

``web3://0x76010876050387FA66E28a1883aD73d576D88Bf2:5/levelAndTile/2/50?returns=(uint256,uint256)``

Returns 2 numbers from this contract method, whose arguments are 2 and 50. The output will be casted as JSON : ``["1","36"]``

``web3://0x1f9840a85d5af5bf1d1762f925bdaddc4201f984/balanceOf/obok.eth?returns=(uint256)``

Call the ``balanceOf`` method of ``0x1f9840a85d5af5bf1d1762f925bdaddc4201f984`` with ``obok.eth`` resolved to this address as an argument.



## Wallet support

evm-browser also ships with [Frame.sh](https://frame.sh/) wallet and local node wallet support, which allows us to have a full read+write experience!

This is thanks to [eth-provider](https://github.com/floating/eth-provider), which is exposed on ``window.ethereum``

## Usage

`evm-browser`

By default it will use the ethereum providers embedded with the [viem.sh](https://viem.sh) library.

If you want to use your own web3 provider for mainnet : `evm-browser --web3-chain 1=https://eth-mainnet.alchemyapi.io/v2/<your-alchemy-key>`

Add or override multiple chains : `evm-browser --web3-chain 42170=https://nova.arbitrum.io/rpc --web3-chain 5=http://127.0.0.1:8545`

Show the devtools : `evm-browser --debug`

## Install from source

`yarn install`

## Usage from source

`yarn start`

If you want to your local evm node for goerli : `yarn start -- -- --web3-chain 5=http://127.0.0.1:8545` (the ``-- --`` is nedded to skip electron-forge then yarn)

