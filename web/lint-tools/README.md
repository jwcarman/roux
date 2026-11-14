ESLint and Prettier for `web/roux-web` live here because typescript-eslint does not support TypeScript 7 (roux-web's compiler), so this package pins TypeScript 6.0.3 for linting only. Run `npm ci` in both `web/` and `web/lint-tools/`, then `npm run lint -w @jwcarman/roux-web`.
Remove this directory, and run the tools from roux-web directly, once typescript-eslint supports TypeScript 7.
