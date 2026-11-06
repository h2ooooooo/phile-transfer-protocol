# Tests

Run npm test from ptp-client, or node scripts/test.cjs from the monorepo root. The runner provisions local servers and disposable fixtures, including linked-directory and large-download cases. Unexpected failures fail the run. npm run test:unit excludes live API tests. Do not point test configs at a live client site.
