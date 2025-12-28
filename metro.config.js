const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Add web support
config.resolver.platforms = ['ios', 'android', 'web'];

// Configure custom resolver for path aliases
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Define path aliases matching babel.config.js and tsconfig.json
  const aliases = {
    '@': path.resolve(__dirname, 'src'),
    '@components': path.resolve(__dirname, 'src/components'),
    '@lib': path.resolve(__dirname, 'src/lib'),
    '@hooks': path.resolve(__dirname, 'src/hooks'),
    '@types': path.resolve(__dirname, 'src/types'),
    '@contexts': path.resolve(__dirname, 'src/contexts'),
    '@config': path.resolve(__dirname, 'src/config'),
    '@polyfills': path.resolve(__dirname, 'src/polyfills'),
    '@shared': path.resolve(__dirname, 'shared'),
  };

  // Check if moduleName starts with any alias
  for (const [alias, aliasPath] of Object.entries(aliases)) {
    if (moduleName === alias || moduleName.startsWith(alias + '/')) {
      const resolved = moduleName.replace(alias, aliasPath);
      return context.resolveRequest(context, resolved, platform);
    }
  }

  // Fall back to default resolver
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
