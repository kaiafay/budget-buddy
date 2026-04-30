import next from "eslint-config-next";

/**
 * Next.js 16’s bundled preset enables strict React Compiler–oriented rules
 * (react-hooks/refs, set-state-in-effect, etc.) that reject common valid patterns
 * in this codebase (swipeable refs, prop→state sync, shadcn primitives).
 * Keep them off until we intentionally adopt the compiler ruleset project-wide.
 */
const eslintConfig = [
  ...next,
  {
    rules: {
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/purity": "off",
    },
  },
];

export default eslintConfig;
