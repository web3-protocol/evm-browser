const webpack = require("webpack");
const webpackConfig = require("./webpack.config.js");

module.exports = {
  packagerConfig: {},
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['linux', 'darwin', 'win32'],
    },
    // {
    //   name: '@electron-forge/maker-squirrel',
    //   config: {},
    // },
    // {
    //   name: '@electron-forge/maker-deb',
    //   config: {},
    // },
    // {
    //   name: '@electron-forge/maker-rpm',
    //   config: {},
    // },
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'nand2',
          name: 'evm-browser'
        },
        // prerelease: true
        draft: true
      }
    }
  ],
  hooks: {
    generateAssets: async (forgeConfig, platform, arch) => {
      
      // Run webpack
      await new Promise((resolve, reject) => {
        webpack(webpackConfig).run(async (err, stats) => {
          if (err) {
            return reject(err);
          }
          return resolve(stats);
        });
      })

    }
  }
};
