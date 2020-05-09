const path = require('path');
const nodeExternals = require('webpack-node-externals');
const UglifyJsPlugin = require('uglifyjs-webpack-plugin');

const entries = {download:'./download.js',init:'./init.js',app:'./main.js',cron:'./cron.js',classify:'./classify.js'}

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
    module: {
        rules: [
            {
                test: /\.js?$/,
                exclude: /(node_modules)/,
                loader: 'babel-loader'
            }
        ]
    },
    resolve: {
        extensions: ['.js']
    },
    plugins: plugins,
    optimization: {
        minimizer: [new UglifyJsPlugin()],
    }
};

module.exports = config;
