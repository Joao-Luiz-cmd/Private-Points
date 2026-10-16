/** Testes unitários: domínio puro e utilitários. jest-expo cobre os componentes RN nas fases seguintes. */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts?(x)'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  collectCoverageFrom: ['src/domain/**/*.ts', 'src/utils/**/*.ts', 'src/security/**/*.ts'],
};
