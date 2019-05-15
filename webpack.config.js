const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const output_path = 'dist';

module.exports = function(env, argv) {
    return [
        {
            entry: './src/popup.tsx',
            output: {
                path: path.resolve(__dirname, output_path),
                filename: 'popup.js',
            },
            resolve: {
                extensions: ['.ts', '.tsx', '.js'],
            },
            devtool: argv.mode === 'production' ? false : 'source-map',
            module: {
                rules: [
                    {
                        test: /\.tsx?$/,
                        exclude: /node_modules/,
                        use: ['ts-loader'],
                    },
                    { enforce: 'pre', test: /\.js$/, loader: 'source-map-loader' },
                ],
            },
            plugins: [
                new HtmlWebpackPlugin({
                    template: 'template/index.html',
                    filename: 'index.html',
                }),
            ],
        },
        {
            entry: './src/background.ts',
            output: {
                path: path.resolve(__dirname, output_path),
                filename: 'background.js',
            },
            resolve: {
                extensions: ['.ts', '.js'],
            },
            devtool: argv.mode === 'production' ? false : 'source-map',
            module: {
                rules: [
                    {
                        test: /\.ts$/,
                        exclude: /node_modules/,
                        use: ['ts-loader'],
                    },
                    { enforce: 'pre', test: /\.js$/, loader: 'source-map-loader' },
                ],
            },
        },
    ];
};
