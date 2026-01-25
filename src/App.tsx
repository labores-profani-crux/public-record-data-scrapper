import { useState, useMemo, useCallback } from 'react'
import { useKV } from '@github/spark/hooks'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { StatsOverview } from '@/components/StatsOverview'
import { ProspectDetailDialog } from '@/components/ProspectDetailDialog'
import { StaleDataWarning } from '@/components/StaleDataWarning'
import { QuickAccessBanner } from '@/components/QuickAccessBanner'
import { ThemeToggle } from '@/components/ThemeToggle'

// Feature tabs
import { ProspectsTab } from '@/features/prospects'
import { PortfolioTab } from '@/features/portfolio'
import { IntelligenceTab } from '@/features/intelligence'
import { AnalyticsTab } from '@/features/analytics'
import { RequalificationTab } from '@/features/requalification'
import { AgenticTab } from '@/features/agentic'

// Hooks
import { useProspectFilters } from '@/hooks/useProspectFilters'
import { useProspectSorting } from '@/hooks/useProspectSorting'
import { useProspectSelection } from '@/hooks/useProspectSelection'
import { useDataFetching } from '@/hooks/useDataFetching'
import { useProspectActions } from '@/hooks/useProspectActions'
import { useNotesAndReminders } from '@/hooks/useNotesAndReminders'
import { useAgenticEngine } from '@/hooks/use-agentic-engine'

// Utils and types
import { generateDashboardStats } from '@/lib/mockData'
import { Prospect } from '@/lib/types'
import { ExportFormat } from '@/lib/exportUtils'
import { SystemContext, PerformanceMetrics, UserAction } from '@/lib/agentic/types'
import { logUserAction } from '@/lib/api/userActions'
import { Target, ChartBar, Heart, ArrowClockwise, Robot, ChartLineUp } from '@phosphor-icons/react'
import { toast } from 'sonner'

function App() {
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [exportFormat, setExportFormat] = useKV<ExportFormat>('export-format', 'json')

  const useMockData =
    import.meta.env.DEV &&
    ['1', 'true', 'yes'].includes(String(import.meta.env.VITE_USE_MOCK_DATA ?? '').toLowerCase())

  // Data fetching
  const data = useDataFetching({ useMockData })

  // Filtering, sorting, and selection
  const filters = useProspectFilters(data.prospects)
  const sorting = useProspectSorting(filters.filteredProspects)
  const selection = useProspectSelection()

  // Notes and reminders
  const notesAndReminders = useNotesAndReminders()

  // Track user actions for agentic analysis
  const trackAction = useCallback(
    async (type: string, details: Record<string, unknown> = {}) => {
      const newAction: UserAction = {
        type,
        timestamp: new Date().toISOString(),
        details
      }

      data.setUserActions((current) => [...(current ?? []), newAction].slice(-100))

      if (!useMockData) {
        try {
          await logUserAction(newAction)
        } catch (error) {
          console.error('Failed to persist user action', error)
        }
      }
    },
    [data, useMockData]
  )

  // Prospect actions (claim, unclaim, export, delete)
  const prospectActions = useProspectActions({
    useMockData,
    prospects: data.prospects,
    setProspects: data.setProspects,
    trackAction,
    exportFormat: exportFormat || 'json',
    hasFilters:
      filters.searchQuery !== '' ||
      filters.industryFilter !== 'all' ||
      filters.stateFilter !== 'all' ||
      filters.minScore > 0
  })

  // Agentic engine
  const systemContext: SystemContext = useMemo(
    () => ({
      prospects: data.prospects,
      competitors: data.competitors,
      portfolio: data.portfolio,
      userActions: data.userActions,
      performanceMetrics: {
        avgResponseTime: 450,
        errorRate: 0.02,
        userSatisfactionScore: 7.5,
        dataFreshnessScore: 85
      } as PerformanceMetrics,
      timestamp: new Date().toISOString()
    }),
    [data.prospects, data.competitors, data.portfolio, data.userActions]
  )

  const agentic = useAgenticEngine(systemContext, {
    enabled: true,
    autonomousExecutionEnabled: false,
    safetyThreshold: 80
  })

  // Dashboard stats
  const stats = useMemo(() => {
    if (data.prospects.length === 0 || data.portfolio.length === 0) {
      return null
    }
    try {
      return generateDashboardStats(data.prospects, data.portfolio)
    } catch (error) {
      console.error('Failed to generate dashboard stats', error)
      return null
    }
  }, [data.prospects, data.portfolio])

  // Handlers
  const handleRefreshData = useCallback(async () => {
    const success = await data.fetchData()
    if (success) {
      void trackAction('refresh-data')
      toast.success('Data refreshed', {
        description: useMockData
          ? 'Mock data regenerated for offline demo mode.'
          : 'Latest datasets synchronized from ingestion services.'
      })
    } else {
      toast.error('Refresh failed', {
        description: data.loadError ?? 'Unable to refresh data from the server.'
      })
    }
  }, [data, trackAction, useMockData])

  const handleProspectSelect = useCallback(
    (prospect: Prospect) => {
      setSelectedProspect(prospect)
      setDialogOpen(true)
      void trackAction('prospect-select', { prospectId: prospect.id })
    },
    [trackAction]
  )

  const handleClaimFromDialog = useCallback(
    async (prospect: Prospect) => {
      await prospectActions.handleClaimLead(prospect)
      setSelectedProspect(null)
      setDialogOpen(false)
    },
    [prospectActions]
  )

  return (
    <div className="min-h-screen">
      <Header onRefresh={handleRefreshData} />
      <QuickAccessBanner />

      <main className="container mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8">
        <div className="space-y-4 sm:space-y-6 md:space-y-8">
          <LoadingAndErrorState
            isLoading={data.isLoading}
            loadError={data.loadError}
            onRetry={() => void data.fetchData()}
          />

          {stats ? (
            <StatsOverview stats={stats} />
          ) : (
            !data.isLoading && (
              <div className="glass-effect border border-white/10 rounded-lg p-4 text-sm text-white/70">
                No aggregated metrics are available yet. Refresh to pull the latest insights.
              </div>
            )
          )}

          {data.lastDataRefresh && (
            <StaleDataWarning lastUpdated={data.lastDataRefresh} onRefresh={handleRefreshData} />
          )}

          <Tabs defaultValue="prospects" className="w-full">
            <TabNavigation />

            <TabsContent value="prospects" className="space-y-4 sm:space-y-6">
              <ProspectsTab
                prospects={data.prospects}
                filteredProspects={sorting.sortedProspects}
                totalCount={data.prospects.length}
                searchQuery={filters.searchQuery}
                industryFilter={filters.industryFilter}
                stateFilter={filters.stateFilter}
                minScore={filters.minScore}
                advancedFilters={filters.advancedFilters}
                activeFilterCount={filters.activeFilterCount}
                industries={filters.industries}
                states={filters.states}
                sortField={sorting.sortField}
                sortDirection={sorting.sortDirection}
                selectedIds={selection.selectedIds}
                exportFormat={exportFormat || 'json'}
                onSearchChange={filters.setSearchQuery}
                onIndustryChange={filters.setIndustryFilter}
                onStateChange={filters.setStateFilter}
                onMinScoreChange={filters.setMinScore}
                onAdvancedFiltersChange={filters.setAdvancedFilters}
                onSortChange={sorting.handleSortChange}
                onSelectionChange={selection.setSelectedIds}
                onExportFormatChange={(format) => setExportFormat(format)}
                onProspectSelect={handleProspectSelect}
                onBatchClaim={prospectActions.handleBatchClaim}
                onBatchExport={prospectActions.handleBatchExport}
                onBatchDelete={prospectActions.handleBatchDelete}
              />
            </TabsContent>

            <TabsContent value="portfolio" className="space-y-4 sm:space-y-6">
              <PortfolioTab portfolio={data.portfolio} />
            </TabsContent>

            <TabsContent value="intelligence" className="space-y-4 sm:space-y-6">
              <IntelligenceTab competitors={data.competitors} />
            </TabsContent>

            <TabsContent value="analytics" className="space-y-4 sm:space-y-6">
              <AnalyticsTab prospects={data.prospects} portfolio={data.portfolio} />
            </TabsContent>

            <TabsContent value="requalification" className="space-y-4 sm:space-y-6">
              <RequalificationTab />
            </TabsContent>

            <TabsContent value="agentic" className="space-y-4 sm:space-y-6">
              <AgenticTab agentic={agentic} competitors={data.competitors} />
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <ProspectDetailDialog
        prospect={selectedProspect}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onClaim={handleClaimFromDialog}
        onUnclaim={prospectActions.handleUnclaimLead}
        onExport={prospectActions.handleExportProspect}
        notes={notesAndReminders.notes}
        reminders={notesAndReminders.reminders}
        onAddNote={notesAndReminders.handleAddNote}
        onDeleteNote={notesAndReminders.handleDeleteNote}
        onAddReminder={notesAndReminders.handleAddReminder}
        onCompleteReminder={notesAndReminders.handleCompleteReminder}
        onDeleteReminder={notesAndReminders.handleDeleteReminder}
        onSendEmail={(email) => notesAndReminders.handleSendEmail(email, trackAction)}
      />
    </div>
  )
}

// Sub-components extracted for clarity

function Header({ onRefresh }: { onRefresh: () => void }) {
  return (
    <header className="mica-effect border-b-2 border-primary/20 sticky top-0 z-50 shadow-xl shadow-primary/10">
      <div className="container mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-5">
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold tracking-tight text-white truncate bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent">
              UCC-MCA Intelligence Platform
            </h1>
            <p className="text-xs sm:text-sm text-white/80 hidden sm:block font-medium">
              Automated merchant cash advance opportunity discovery
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <ThemeToggle />
            <Button
              variant="outline"
              onClick={onRefresh}
              size="sm"
              className="glass-effect border-white/30 text-white hover:bg-white/10 hover:border-white/50"
            >
              <ArrowClockwise size={16} weight="bold" className="sm:mr-2" />
              <span className="hidden sm:inline">Refresh Data</span>
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}

function LoadingAndErrorState({
  isLoading,
  loadError,
  onRetry
}: {
  isLoading: boolean
  loadError: string | null
  onRetry: () => void
}) {
  return (
    <>
      {loadError && (
        <div className="glass-effect border border-red-500/40 rounded-lg p-4 text-red-100 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <p className="font-semibold">Failed to load live data</p>
            <p className="text-sm text-red-100/80">{loadError}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="border-red-500/60 text-red-100 hover:bg-red-500/20"
          >
            Retry
          </Button>
        </div>
      )}

      {isLoading && (
        <div className="glass-effect border border-white/20 rounded-lg p-4 text-sm text-white/80">
          Loading live data from ingestion services...
        </div>
      )}
    </>
  )
}

function TabNavigation() {
  return (
    <TabsList className="glass-effect grid w-full grid-cols-3 sm:grid-cols-6 mb-4 sm:mb-6 gap-1 sm:gap-0 h-auto sm:h-10 p-1">
      <TabsTrigger
        value="prospects"
        className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 py-2 sm:py-0"
      >
        <Target size={16} weight="fill" className="sm:w-[18px] sm:h-[18px]" />
        <span className="hidden xs:inline">Prospects</span>
      </TabsTrigger>
      <TabsTrigger
        value="portfolio"
        className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 py-2 sm:py-0"
      >
        <Heart size={16} weight="fill" className="sm:w-[18px] sm:h-[18px]" />
        <span className="hidden xs:inline">Portfolio</span>
      </TabsTrigger>
      <TabsTrigger
        value="intelligence"
        className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 py-2 sm:py-0"
      >
        <ChartBar size={16} weight="fill" className="sm:w-[18px] sm:h-[18px]" />
        <span className="hidden xs:inline">Intelligence</span>
      </TabsTrigger>
      <TabsTrigger
        value="analytics"
        className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 py-2 sm:py-0"
      >
        <ChartLineUp size={16} weight="fill" className="sm:w-[18px] sm:h-[18px]" />
        <span className="hidden xs:inline">Analytics</span>
      </TabsTrigger>
      <TabsTrigger
        value="requalification"
        className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 py-2 sm:py-0"
      >
        <ArrowClockwise size={16} weight="fill" className="sm:w-[18px] sm:h-[18px]" />
        <span className="hidden xs:inline">Re-qual</span>
      </TabsTrigger>
      <TabsTrigger
        value="agentic"
        className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 py-2 sm:py-0"
      >
        <Robot size={16} weight="fill" className="sm:w-[18px] sm:h-[18px]" />
        <span className="hidden xs:inline">Agentic</span>
      </TabsTrigger>
    </TabsList>
  )
}

export default App
