/**
 * Shared Test Utilities
 *
 * Common test infrastructure used across all test suites.
 */

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

export interface TestSuite {
  name: string;
  tests: TestFn[];
}

export type TestFn = () => Promise<TestResult>;

/**
 * Create a test function that tracks results
 */
export function test(name: string, fn: () => void | Promise<void>): TestFn {
  return async (): Promise<TestResult> => {
    const start = Date.now();
    try {
      await fn();
      return { name, passed: true, duration: Date.now() - start };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { name, passed: false, error, duration: Date.now() - start };
    }
  };
}

/**
 * Assert a condition is true
 */
export function assert(condition: boolean, message?: string): void {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

/**
 * Assert two values are equal
 */
export function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message ? `${message}: expected ${expected}, got ${actual}` : `Expected ${expected}, got ${actual}`);
  }
}

/**
 * Assert two buffers are equal
 */
export function assertBuffersEqual(actual: Buffer, expected: Buffer, message?: string): void {
  if (!actual.equals(expected)) {
    let diffIndex = -1;
    const minLen = Math.min(actual.length, expected.length);
    for (let i = 0; i < minLen; i++) {
      if (actual[i] !== expected[i]) {
        diffIndex = i;
        break;
      }
    }
    if (diffIndex === -1 && actual.length !== expected.length) {
      throw new Error(`${message || 'Buffers'}: length mismatch (${actual.length} vs ${expected.length})`);
    }
    throw new Error(
      `${message || 'Buffers'}: differ at index ${diffIndex} (0x${actual[diffIndex]?.toString(16)} vs 0x${expected[diffIndex]?.toString(16)})`
    );
  }
}

/**
 * Run a test suite and return results
 */
export async function runSuite(suite: TestSuite): Promise<TestResult[]> {
  const results: TestResult[] = [];

  for (const testFn of suite.tests) {
    const result = await testFn();
    results.push(result);

    if (result.passed) {
      console.log(`  \u2713 ${result.name}`);
    } else {
      console.log(`  \u2717 ${result.name}`);
      console.log(`    Error: ${result.error}`);
    }
  }

  return results;
}

/**
 * Print final summary of all test results
 */
export function printSummary(allResults: TestResult[]): void {
  const passed = allResults.filter(r => r.passed).length;
  const failed = allResults.filter(r => !r.passed).length;
  const totalTime = allResults.reduce((sum, r) => sum + r.duration, 0);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`Results: ${passed} passed, ${failed} failed (${totalTime}ms)`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    console.log('Failed tests:');
    for (const r of allResults.filter(r => !r.passed)) {
      console.log(`  - ${r.name}: ${r.error}`);
    }
  }
}
