export default {
  "**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}": [
    "prettier --write",
    "biome lint --write --no-errors-on-unmatched",
  ],
};
