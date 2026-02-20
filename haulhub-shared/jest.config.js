module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        types: ['jest', 'node'],
        typeRoots: ['../node_modules/@types'],
      },
    }],
  },
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
};
