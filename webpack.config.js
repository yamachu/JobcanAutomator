const path = require('path');

const output_path = 'dist';

module.exports = function(env, argv) {
    return [
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
        {
            entry: './content/content.js',
            output: {
                path: path.resolve(__dirname, output_path),
                filename: 'content.js',
            },
            resolve: {
                extensions: ['.js'],
            },
            devtool: argv.mode === 'production' ? false : 'source-map',
        },
    ];
};
