const js = require("@eslint/js");
const tseslint = require("typescript-eslint");

module.exports = tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "coverage/**",
      ".tmp/**",
      "miniprogram/shared/vendor/riichi-bundle.js",
      "miniprogram/miniprogram_npm/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: false
      }
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_"
        }
      ]
    }
  },
  {
    files: ["miniprogram/**/*.ts"],
    languageOptions: {
      globals: {
        App: "readonly",
        Page: "readonly",
        wx: "readonly",
        getApp: "readonly",
        getCurrentPages: "readonly"
      }
    }
  },
  {
    files: ["web/**/*.ts"],
    languageOptions: {
      globals: {
        document: "readonly",
        window: "readonly",
        MutationObserver: "readonly",
        fetch: "readonly",
        console: "readonly"
      }
    }
  },
  {
    files: ["scripts/**/*.cjs", "cloudrun/**/*.cjs", "*.config.js"],
    languageOptions: {
      globals: {
        require: "readonly",
        module: "readonly",
        __dirname: "readonly",
        Buffer: "readonly",
        process: "readonly",
        console: "readonly"
      }
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off"
    }
  },
  {
    files: ["miniprogram/types/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off"
    }
  },
  {
    files: ["tests/**/*.ts"],
    languageOptions: {
      globals: {
        console: "readonly"
      }
    }
  }
);
