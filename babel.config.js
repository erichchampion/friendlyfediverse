module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "module-resolver",
        {
          root: ["./src"],
          alias: {
            "@": "./src",
            "@components": "./src/components",
            "@lib": "./src/lib",
            "@hooks": "./src/hooks",
            "@types": "./src/types",
            "@contexts": "./src/contexts",
            "@config": "./src/config",
            "@polyfills": "./src/polyfills",
            "@shared": "./shared",
          },
          extensions: [".ios.js", ".android.js", ".js", ".ts", ".tsx", ".json"],
        },
      ],
      // Reanimated plugin has to be listed last
      "react-native-reanimated/plugin",
    ],
  };
};
