module.exports = {
  mode: 'production',
  entry: './example/eth-provider-injected.js',
  output: {
    filename: 'eth-provider-injected.packed.js',
    path: `${__dirname}/dist`,
  },
};