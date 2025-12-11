/**
 * Test setup file for Vitest
 * Configures the testing environment with necessary globals and utilities
 */

/// <reference types="@testing-library/jest-dom" />

import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'

// Cleanup after each test case
afterEach(() => {
  cleanup()
})
