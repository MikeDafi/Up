const getEnvFilePath = () => {
  const env = process.env.ENV_NAME || 'prod'; // Default to 'prod' if ENV_NAME is not set
  switch (env) {
    case 'dev':
      return 'configs/dev/.env.dev';
    case 'staging':
      return 'configs/staging/.env.staging';
    case 'prod':
    default:
      return 'configs/prod/.env.prod';
  }
};

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module:react-native-dotenv',
        {
          moduleName: '@env',
          path: getEnvFilePath(),
          safe: true,
          allowUndefined: false,
        },
      ],
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@assets': './assets',
            // Add more aliases as needed
          },
        },
      ],
    ],
  };
};
