import config from "./lint-staged.mjs";

export default Object.fromEntries(
  Object.entries(config).map(([pattern, commands]) => [
    pattern,
    [...commands, "eslint --fix"],
  ]),
);
