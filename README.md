# EVM Browser

Web browser with support of the [ERC-6860](https://eips.ethereum.org/EIPS/eip-6860) ``web3://`` protocol, which can show on-chain websites hosted on Ethereum and all others EVM chains. It includes support for the [Frame.sh](https://frame.sh/) wallet.

![./screenshot2.png](./screenshot2.png)

As an example, ``web3://terraformnavigator.eth/`` is an on-chain website served by a [smart contract](https://etherscan.io/address/0xad41bf1c7f22f0ec988dac4c0ae79119cab9bb7e#code), which interacts with the [Terraform NFT contract](https://etherscan.io/address/0x4e1f41613c9084fdb9e34e11fae9412427480e56#code) : pages are generated dynamically, these are not static pages.

The browser works out of the box with all chains (providers are given by [viem.sh](https://viem.sh/) and [chainid.network](https://chainid.network/)) and support the [Frame.sh](https://frame.sh/) wallet.

ENS domain name resolution ([proposed EIP-6821](https://ethereum-magicians.org/t/eip-6821-support-ens-name-for-web3-url/13654)) happens via the declaration of a ``contentcontract`` TXT record containing a [EIP-3770 chain-specific address](https://eips.ethereum.org/EIPS/eip-3770), or, if not present, via a standard resolution.

Browser forked from the great [electron-as-browser](https://github.com/hulufei/electron-as-browser) from hulufei.

In the above example, clicking on a terraform will load a dynamic page, for example : 

``web3://terraformnavigator.eth/view/9352``

![./screenshot3.png](./screenshot3.png)

More examples : 

``web3://0xA66556f4DB239E713491859258E577f25510eFd6:5/``

Load a on-chain website on goerli (``:5`` is the chain id of goerli).

``web3://0x5a985f13345e820aa9618826b85f74c3986e1463:5/tokenHTML/2``

Call the ``tokenHTML`` method of ``0x5a985f13345e820aa9618826b85f74c3986e1463`` on goerli, and gives the uint 2 as an argument.

``web3://0x5a985f13345e820aa9618826b85f74c3986e1463:5/tokenSVG/2?mime.type=svg``

Call the ``tokenSVG`` method of ``0x5a985f13345e820aa9618826b85f74c3986e1463`` on goerli, gives the uint 2 as an argument, and return the result as ``image/svg+xml``. 

``web3://0x76010876050387FA66E28a1883aD73d576D88Bf2:5/levelAndTile/2/50?returns=(uint256,uint256)``

Returns 2 numbers from this contract method, whose arguments are 2 and 50. The output will be casted as JSON : ``["1","36"]``

``web3://0x1f9840a85d5af5bf1d1762f925bdaddc4201f984/balanceOf/obok.eth?returns=(uint256)``

Call the ``balanceOf`` method of ``0x1f9840a85d5af5bf1d1762f925bdaddc4201f984`` with ``obok.eth`` resolved to this address as an argument.



## Wallet support

EVM Browser also ships with [Frame.sh](https://frame.sh/) wallet and local node wallet support, which allows us to have a full read+write experience!

This is thanks to [eth-provider](https://github.com/floating/eth-provider), which is exposed on ``window.ethereum``

## Web3 domain support

EVM Browser support ``.eth`` ENS domains and ``.og`` Linagee domains.


## Current limitations

Due to a bug in electron, web storage apis (localStorage, sessionStorage, webSQL, indexedDB, cookies) are disabled for now (see [progress in issue](https://github.com/nand2/evm-browser/issues/3))

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

## Debugging

All calls to ``web3://`` are returned with debugging headers, visible in the devtools, to help understand what is happening.

- ``web3-nameservice-chainid`` The chain id where the domain name resolver was called.
- ``web3-target-chainid`` After nameservice resolution, the chaid id where the actual call will happen.
- ``web3-resolve-mode`` Indicate if the web3 call will be made in ``auto`` or ``manual`` mode (see EIP 4804 specs)
- ``web3-auto-method`` If ``auto`` mode, the name of the smartcontract method that will be called.
- ``web3-auto-args`` If ``auto`` mode, the types of the arguments that will be given to the smartcontract method.
- ``web3-auto-return`` If ``auto`` mode, the types of the data returned by the smartcontract method.
- ``web3-calldata`` If ``manual`` mode, the calldata sent to the contract.
