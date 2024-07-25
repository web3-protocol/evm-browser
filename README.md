# EVM Browser

Web browser with support of the [ERC-4804 / ERC-6860 ``web3://`` protocol](https://docs.web3url.io/), which can show on-chain websites hosted on Ethereum and all others EVM chains. It includes support for the [Frame.sh](https://frame.sh/) wallet.

![./screenshot2.png](./screenshot2.png)

As an example, ``web3://terraformnavigator.eth/`` is an on-chain website served by a [smart contract](https://etherscan.io/address/0xad41bf1c7f22f0ec988dac4c0ae79119cab9bb7e#code), which interacts with the [Terraform NFT contract](https://etherscan.io/address/0x4e1f41613c9084fdb9e34e11fae9412427480e56#code) : pages are generated dynamically, these are not static pages.

The browser works out of the box with all chains (providers are given by [viem.sh](https://viem.sh/) and [chainid.network](https://chainid.network/)) and support the [Frame.sh](https://frame.sh/) wallet. The browser is forked from the great [electron-as-browser](https://github.com/hulufei/electron-as-browser) from hulufei.

In the above example, clicking on a terraform will load a dynamic page, for example : 

``web3://terraformnavigator.eth/view/9352``

![./screenshot3.png](./screenshot3.png)

More examples : 

``web3://0x4E1f41613c9084FdB9E34E11fAE9412427480e56/tokenHTML/9352``

Call the ``tokenHTML`` method of ``0x4E1f41613c9084FdB9E34E11fAE9412427480e56``, and gives the uint 9352 as an argument.

``web3://0x4E1f41613c9084FdB9E34E11fAE9412427480e56/tokenSVG/9352?mime.type=svg``

Call the ``tokenSVG`` method of ``0x5a985f13345e820aa9618826b85f74c3986e1463``, gives the uint 9352 as an argument, and return the result as ``image/svg+xml``. 

``web3://0xA5aFC9fE76a28fB12C60954Ed6e2e5f8ceF64Ff2/levelAndTile/2/50?returns=(uint256,uint256)``

Returns 2 numbers from this contract method, whose arguments are 2 and 50. The output will be casted as JSON : ``["0x1","0x24"]``

``web3://usdc.eth/balanceOf/vitalik.eth?returns=(uint256)``

Call the ``balanceOf`` method of ``usdc.eth`` with ``vitalik.eth`` resolved to this address as an argument.

See the [ ``web3://`` protocol documentation](https://docs.web3url.io/) for more infos.



## Wallet support

EVM Browser also ships with [Frame.sh](https://frame.sh/) wallet and local node wallet support, which allows us to have a full read+write experience!

This is thanks to [eth-provider](https://github.com/floating/eth-provider), which is exposed on ``window.ethereum``

## Web3 domain support

EVM Browser support ``.eth`` ENS domains and ``.og`` Linagee domains.


## Current limitations

- web storage apis (localStorage, sessionStorage, webSQL, indexedDB, cookies) are disabled for now (see [progress in issue](https://github.com/nand2/evm-browser/issues/3)), due to a bug in electron.
- Loading resources from blockchain with a chain id above 65536 (such as Sepolia) will fail. 

## Usage

`evm-browser`

By default it will use the ethereum providers embedded with the [viem.sh](https://viem.sh) library.

If you want to use your own web3 provider for mainnet : `evm-browser --chain-rpc 1=https://eth-mainnet.alchemyapi.io/v2/<your-alchemy-key>`

Add or override multiple chains : `evm-browser --chain-rpc 42170=https://nova.arbitrum.io/rpc --chain-rpc 5=http://127.0.0.1:8545`

Show the devtools : `evm-browser --debug`

## Install from source

`yarn install`

## Usage from source

`yarn start`

If you want to use your local evm node for sepolia : `yarn start -- -- --chain-rpc 11155111=http://127.0.0.1:8545` (the ``-- --`` is nedded to skip electron-forge then yarn)

## Debugging

All calls to ``web3://`` are returned with debugging headers, visible in the devtools, to help understand what is happening.

- ``web3-nameservice-chainid`` The chain id where the domain name resolver was called.
- ``web3-target-chainid`` After nameservice resolution, the chaid id where the actual call will happen.
- ``web3-resolve-mode`` Indicate if the web3 call will be made in ``auto`` or ``manual`` mode (see EIP 4804 specs)
- ``web3-auto-method`` If ``auto`` mode, the name of the smartcontract method that will be called.
- ``web3-auto-args`` If ``auto`` mode, the types of the arguments that will be given to the smartcontract method.
- ``web3-auto-return`` If ``auto`` mode, the types of the data returned by the smartcontract method.
- ``web3-calldata`` If ``manual`` mode, the calldata sent to the contract.
