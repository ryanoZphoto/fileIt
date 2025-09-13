module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } },
  plugins: ["react", "react-hooks", "jsx-a11y", "prettier"],
  extends: [
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "plugin:jsx-a11y/recommended",
    "plugin:prettier/recommended"
  ],
  settings: { react: { version: "detect" } },
  rules: {
    "react/prop-types": "off",
    "prettier/prettier": ["error", { endOfLine: "auto" }],
    "no-empty": "off",
    "no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_", "caughtErrors": "none" }]
  },
  ignorePatterns: ["dist/", "node_modules/", "src/App.bak.jsx", "*.bak.*"]
};
