const path = require('path');
const nodeExternals = require('webpack-node-externals');
const TerserPlugin = require('terser-webpack-plugin');
const entries = {init:'./init.js',app:'./main.js',download:'./download.js',cron_download:'./cron.js',classify:'./classify.js'}

const plugins = [];

const config = {
    target: 'node',
    entry: entries,
    devtool: 'source-map',
    output: {
        path: path.resolve(__dirname, './dist'),
        filename: '[name].js',
        library: '[name]',
        libraryTarget: 'umd',
        umdNamedDefine: true
    },
    externals: [nodeExternals()],
    plugins: plugins,
    optimization: {
        minimize: true,
        minimizer: [new TerserPlugin()],
    }
};

module.exports = config;
