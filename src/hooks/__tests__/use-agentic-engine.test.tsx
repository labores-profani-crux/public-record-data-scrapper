import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { useEffect, useMemo, useState } from 'react'

import { useAgenticEngine } from '../use-agentic-engine'
import { AgenticEngine } from '@/lib/agentic/AgenticEngine'
import type { SystemContext, PerformanceMetrics } from '@/lib/agentic/types'

vi.mock('@github/spark/hooks', async () => {
  const React = await import('react')
  return {
    useKV: <T,>(key: string, initialValue: T): [
      T,
      React.Dispatch<React.SetStateAction<T>>,
      (value?: T) => void
    ] => {
      const [value, setValue] = React.useState<T>(initialValue)
      const deleteValue = (resetValue?: T) => {
        if (resetValue !== undefined) {
          setValue(resetValue)
        } else {
          setValue(initialValue)
        }
      }
      return [value, setValue, deleteValue]
    }
  }
})

const baseMetrics: PerformanceMetrics = {
  avgResponseTime: 500,
  errorRate: 0.02,
  userSatisfactionScore: 7,
  dataFreshnessScore: 80
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useAgenticEngine auto-run effect', () => {
  it('triggers a single autonomous cycle after prospects are seeded', async () => {
    const runAutonomousCycleSpy = vi
      .spyOn(AgenticEngine.prototype, 'runAutonomousCycle')
      .mockResolvedValue({
        review: { analyses: [], improvements: [], agents: [] },
        executedImprovements: [],
        pendingImprovements: []
      } as any)

    vi.spyOn(AgenticEngine.prototype, 'getSystemHealth').mockReturnValue({
      totalImprovements: 0,
      implemented: 0,
      pending: 0,
      successRate: 0,
      avgSafetyScore: 0
    })

    const TestComponent = () => {
      const [prospects, setProspects] = useState<any[]>([])
      const [updateCount, setUpdateCount] = useState(0)

      const context: SystemContext = useMemo(() => ({
        prospects,
        competitors: [],
        portfolio: [],
        userActions: [],
        performanceMetrics: baseMetrics,
        timestamp: new Date().toISOString()
      }), [prospects])

      useAgenticEngine(context, { enabled: true })

      useEffect(() => {
        if (prospects.length === 0) {
          setProspects([{ id: 'p-1' }])
        } else if (updateCount === 0) {
          setUpdateCount(1)
          setProspects([{ id: 'p-1' }, { id: 'p-2' }])
        }
      }, [prospects, updateCount])

      return null
    }

    render(<TestComponent />)

    await waitFor(() => {
      expect(runAutonomousCycleSpy).toHaveBeenCalledTimes(1)
    })

    await new Promise(resolve => setTimeout(resolve, 50))

    expect(runAutonomousCycleSpy).toHaveBeenCalledTimes(1)
  })
})
