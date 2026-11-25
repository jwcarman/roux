// Stryker leaves one thing unmutated: the path a route file passes to createFileRoute. The router
// plugin (vite.config.ts) writes that path from the file's place under src/routes and puts it back
// when it is wrong, on every build and test run, and the generated route tree, not the string,
// sets the route's path at run time. A mutant of it changes nothing a test could see.
export const strykerPlugins = [
  {
    kind: "Ignore",
    name: "route-path",
    value: {
      shouldIgnore(path) {
        const call = path.parentPath;
        if (
          path.node.type === "StringLiteral" &&
          call?.node.type === "CallExpression" &&
          call.node.callee.type === "Identifier" &&
          call.node.callee.name === "createFileRoute" &&
          call.node.arguments[0] === path.node
        ) {
          return "The router plugin writes and corrects a route file's path; it has no effect at run time.";
        }
        return undefined;
      },
    },
  },
];
