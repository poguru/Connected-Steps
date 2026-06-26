import type { Config } from "jest";

const config: Config = {
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          moduleResolution: "node",
          module: "CommonJS",
          paths: { "@/*": ["./*"] },
        },
      },
    ],
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  testMatch:   ["**/__tests__/**/*.test.ts"],
  setupFilesAfterFramework: [],
  setupFiles:  ["<rootDir>/__tests__/setup.ts"],
};

export default config;
