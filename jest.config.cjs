module.exports = {
  preset: 'ts-jest',
  roots: ['<rootDir>/shared', '<rootDir>/client/src', '<rootDir>/server'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  projects: [
    {
      displayName: 'client',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/client/**/*.test.{ts,tsx}'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/client/src/$1',
        '^@shared/(.*)$': '<rootDir>/shared/$1',
        '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
      },
      transform: {
        '^.+\\.tsx?$': ['ts-jest', {
          tsconfig: {
            jsx: 'react',
            esModuleInterop: true,
            types: ['node', 'jest', '@types/jest'],
          },
        }],
      },
      setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
    },
    {
      displayName: 'server',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/server/**/*.test.ts', '<rootDir>/shared/**/*.test.ts'],
      moduleNameMapper: {
        '^@shared/(.*)$': '<rootDir>/shared/$1',
      },
      transform: {
        '^.+\\.ts$': ['ts-jest', {
          tsconfig: {
            esModuleInterop: true,
            types: ['node', 'jest', '@types/jest'],
          },
        }],
      },
      setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
    }
  ],
};
