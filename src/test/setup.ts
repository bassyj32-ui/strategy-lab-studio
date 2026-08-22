// Vitest global setup: unmount React Testing Library renders after each test.
// Without this, consecutive `render(<Component />)` calls accumulate duplicate
// DOM nodes and `getByTestId` fails with "multiple elements found".
//
// Guarded so pure-node test files (default vitest environment) are unaffected:
// they never mount anything and have no `document`.
import { afterEach } from 'vitest';

afterEach(async () => {
  if (typeof document !== 'undefined') {
    const { cleanup } = await import('@testing-library/react');
    cleanup();
  }
});
