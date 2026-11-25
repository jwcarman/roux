import { setupServer } from "msw/node";

/**
 * The fake network every test runs against (Mock Service Worker). It starts with no handlers: a test
 * answers what it expects with `server.use(http.get(...))`, and the handlers go after each test.
 */
export const server = setupServer();

const unanswered: string[] = [];
const inFlight = new Set<string>();

/** Starts the fake network. A request no handler answers fails, and so does the test that sent it. */
export function listen(): void {
  server.events.on("request:unhandled", ({ request }) => {
    unanswered.push(`${request.method} ${new URL(request.url).pathname}`);
  });
  server.events.on("request:start", ({ requestId }) => {
    inFlight.add(requestId);
  });
  server.events.on("request:end", ({ requestId }) => {
    inFlight.delete(requestId);
  });
  server.listen({ onUnhandledFrame: "error" });
}

/** Stops the fake network and forgets its listeners: test files share the server, and each file listens anew. */
export function stop(): void {
  server.events.removeAllListeners();
  server.close();
}

/**
 * Throws if the test sent a request no handler answered. The app usually catches the failed request
 * (TanStack Query does), so without this check the test could pass on the wrong screen.
 */
export function checkAllAnswered(): void {
  const requests = unanswered.splice(0);
  if (requests.length > 0) {
    throw new Error(`No handler answered: ${requests.join(", ")}`);
  }
}

/**
 * Waits, for at most `timeout` milliseconds, until every request the app sent has its answer and the
 * app has handled it. A test can pass while the app is still loading something in the background
 * (the member's profile, say); on a slow machine that answer would otherwise land after the test
 * environment is gone and crash the run. A request held open on purpose (`delay("infinite")`) is
 * given up on after the timeout.
 */
export async function settle(timeout = 1000): Promise<void> {
  const deadline = AbortSignal.timeout(timeout);
  // A request reaches MSW a turn after the app sends it, and the app handles the answer a turn after
  // it arrives: let each happen before looking.
  await nextTurn();
  await drain(deadline);
  inFlight.clear();
  await nextTurn();
}

/** Waits, a few milliseconds at a time, until no request is in flight or the deadline passes. */
async function drain(deadline: AbortSignal): Promise<void> {
  if (inFlight.size === 0 || deadline.aborted) {
    return;
  }
  await nextTurn(10);
  return drain(deadline);
}

function nextTurn(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
