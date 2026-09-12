import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    files: ["**/*.{js,mjs,ts}"],
    ignores: ["node_modules/**", "bin/**"],
    extends: [
      js.configs.recommended,
      {
        languageOptions: {
          globals: {
            ...globals.node,
          },
        },
      },
    ],
    rules: {
      "no-unused-vars": [
        "error",
        {
          varsIgnorePattern: "^_",
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
]);
