export type HealthGrade = 'A' | 'B' | 'C' | 'D' | 'F'
export type SignalType = 'hiring' | 'permit' | 'contract' | 'expansion' | 'equipment'
export type ProspectStatus = 'new' | 'claimed' | 'contacted' | 'qualified' | 'dead'
export type IndustryType = 'restaurant' | 'retail' | 'construction' | 'healthcare' | 'manufacturing' | 'services' | 'technology'

export interface UCCFiling {
  id: string
  filingDate: string
  debtorName: string
  securedParty: string
  state: string
  lienAmount?: number
  status: 'active' | 'terminated' | 'lapsed'
  filingType: 'UCC-1' | 'UCC-3'
}

export interface GrowthSignal {
  id: string
  type: SignalType
  description: string
  detectedDate: string
  sourceUrl?: string
  score: number
  confidence: number
}

export interface HealthScore {
  grade: HealthGrade
  score: number
  sentimentTrend: 'improving' | 'stable' | 'declining'
  reviewCount: number
  avgSentiment: number
  violationCount: number
  lastUpdated: string
}

export interface Prospect {
  id: string
  companyName: string
  industry: IndustryType
  state: string
  status: ProspectStatus
  priorityScore: number
  defaultDate: string
  timeSinceDefault: number
  lastFilingDate?: string
  uccFilings: UCCFiling[]
  growthSignals: GrowthSignal[]
  healthScore: HealthScore
  narrative: string
  estimatedRevenue?: number
  claimedBy?: string
  claimedDate?: string
}

export interface CompetitorData {
  lenderName: string
  filingCount: number
  avgDealSize: number
  marketShare: number
  industries: IndustryType[]
  topState: string
  monthlyTrend: number
}

export interface PortfolioCompany {
  id: string
  companyName: string
  fundingDate: string
  fundingAmount: number
  currentStatus: 'performing' | 'watch' | 'at-risk' | 'default'
  healthScore: HealthScore
  lastAlertDate?: string
}

export interface RequalificationLead {
  id: string
  originalProspect: Prospect
  newSignals: GrowthSignal[]
  netScore: number
  recommendation: 'revive' | 'dismiss'
  reasoning: string
}

export interface DashboardStats {
  totalProspects: number
  highValueProspects: number
  avgPriorityScore: number
  newSignalsToday: number
  portfolioAtRisk: number
  avgHealthGrade: string
}

// Recursive Company Relationship Types
export type RelationshipType =
  | 'parent'
  | 'subsidiary'
  | 'affiliate'
  | 'guarantor'
  | 'common_secured_party'
  | 'cross_collateral'
  | 'same_industry'
  | 'supplier'
  | 'customer'

export interface CompanyRelationship {
  fromCompanyId: string
  toCompanyId: string
  relationshipType: RelationshipType
  confidence: number
  sourceFilingId?: string
  discoveredDate: string
  depth: number // Recursion depth at which discovered
  metadata?: Record<string, any>
}

export interface CompanyNode {
  id: string
  companyName: string
  prospect?: Prospect
  relationships: CompanyRelationship[]
  depth: number
  visitedAt?: string
}

export interface CompanyGraph {
  rootId: string
  nodes: Map<string, CompanyNode>
  edges: CompanyRelationship[]
  maxDepth: number
  totalNodes: number
  totalEdges: number
  createdAt: string
  metadata: {
    riskConcentration?: number
    networkHealth?: HealthGrade
    totalExposure?: number
  }
}

export interface RecursiveTraversalConfig {
  maxDepth: number
  relationshipTypes: RelationshipType[]
  includeProspectData: boolean
  stopConditions?: {
    maxNodes?: number
    maxEdges?: number
    healthThreshold?: number
  }
}

// Generative AI Types
export interface GenerativeContext {
  prospect: Prospect
  marketData?: CompetitorData[]
  relationships?: CompanyGraph
  historicalSignals?: GrowthSignal[]
  industryTrends?: IndustryTrend[]
}

export interface GenerativeNarrative {
  id: string
  prospectId: string
  content: string
  sections: {
    summary: string
    keyFindings: string[]
    opportunityAnalysis: string
    riskFactors: string[]
    recommendedActions: string[]
    marketContext?: string
    competitiveLandscape?: string
  }
  generatedAt: string
  model: string
  confidence: number
  sources: string[]
  personalizationFactors?: string[]
}

export interface GenerativeInsight {
  id: string
  type: 'opportunity' | 'risk' | 'trend' | 'recommendation'
  title: string
  description: string
  confidence: number
  impact: 'high' | 'medium' | 'low'
  relatedProspects: string[]
  generatedAt: string
  evidence: string[]
}

export interface IndustryTrend {
  industry: IndustryType
  direction: 'growth' | 'decline' | 'stable'
  growthRate: number
  keyDrivers: string[]
  threats: string[]
  opportunities: string[]
  updatedAt: string
}

// Personalized Recommendation Types
export interface UserProfile {
  userId: string
  preferences: {
    industries: IndustryType[]
    states: string[]
    minPriorityScore: number
    minHealthGrade: HealthGrade
    preferredSignalTypes: SignalType[]
    riskTolerance: 'low' | 'medium' | 'high'
  }
  behavior: {
    claimPatterns: ClaimPattern[]
    conversionRate: number
    avgTimeToContact: number
    successfulIndustries: IndustryType[]
    preferredDealSize: { min: number; max: number }
  }
  customFilters: SavedFilter[]
  dashboardLayout: DashboardLayout
  notificationSettings: NotificationSettings
  createdAt: string
  lastActive: string
}

export interface ClaimPattern {
  industries: IndustryType[]
  avgScore: number
  signalTypes: SignalType[]
  outcomeRate: number
  frequency: number
}

export interface SavedFilter {
  id: string
  name: string
  filters: {
    industry?: IndustryType
    state?: string
    minScore?: number
    maxScore?: number
    healthGrade?: HealthGrade[]
    signalTypes?: SignalType[]
    status?: ProspectStatus[]
  }
  isDefault: boolean
  createdAt: string
  usageCount: number
}

export interface DashboardLayout {
  widgets: DashboardWidget[]
  columns: number
  theme: 'light' | 'dark' | 'auto'
}

export interface DashboardWidget {
  id: string
  type: 'prospects' | 'stats' | 'signals' | 'portfolio' | 'competitors' | 'recommendations' | 'insights'
  position: { x: number; y: number }
  size: { width: number; height: number }
  config: Record<string, any>
}

export interface NotificationSettings {
  newProspects: boolean
  healthAlerts: boolean
  signalDetection: boolean
  portfolioUpdates: boolean
  competitorActivity: boolean
  requalificationOpportunities: boolean
  aiInsights: boolean
  channels: {
    email: boolean
    inApp: boolean
    push: boolean
  }
}

export interface PersonalizedRecommendation {
  id: string
  userId: string
  prospectId: string
  prospect: Prospect
  score: number
  reasons: RecommendationReason[]
  matchFactors: {
    industryMatch: number
    scoreMatch: number
    signalMatch: number
    behaviorMatch: number
    networkMatch: number
  }
  generatedAt: string
  expiresAt: string
  status: 'new' | 'viewed' | 'claimed' | 'dismissed'
}

export interface RecommendationReason {
  factor: string
  description: string
  weight: number
  evidence: string[]
}

// Recursive Signal Detection Types
export interface SignalChain {
  id: string
  prospectId: string
  rootSignal: GrowthSignal
  chainedSignals: ChainedSignal[]
  totalConfidence: number
  chainStrength: number
  discoveryPath: string[]
  detectedAt: string
}

export interface ChainedSignal {
  signal: GrowthSignal
  depth: number
  parentSignalId: string
  relationshipType: 'triggered_by' | 'correlated_with' | 'implies'
  confidence: number
}

export interface RecursiveSignalConfig {
  maxDepth: number
  minConfidence: number
  signalTriggers: Record<SignalType, SignalType[]>
  correlationThreshold: number
}

// Recursive Enrichment Types
export interface EnrichmentStep {
  id: string
  name: string
  type: 'revenue' | 'industry' | 'signals' | 'health' | 'relationships' | 'market'
  priority: number
  dependencies: string[]
  estimatedDuration: number
}

export interface EnrichmentPlan {
  prospectId: string
  steps: EnrichmentStep[]
  currentDepth: number
  maxDepth: number
  adaptiveStrategy: boolean
  completedSteps: string[]
  createdAt: string
}

export interface RecursiveEnrichmentResult {
  prospectId: string
  originalProspect: Prospect
  enrichedProspect: Prospect
  executedSteps: EnrichmentStep[]
  improvements: {
    dataCompleteness: number
    confidenceIncrease: number
    newFieldsAdded: string[]
  }
  totalDepth: number
  duration: number
}

// Recursive Lead Re-qualification Types
export interface NetworkRequalification {
  rootLeadId: string
  requalifiedLeads: RequalificationLead[]
  networkGraph: CompanyGraph
  totalOpportunityValue: number
  recommendations: NetworkRecommendation[]
  executionDepth: number
  completedAt: string
}

export interface NetworkRecommendation {
  type: 'cross_sell' | 'upsell' | 'cluster_approach' | 'avoid'
  targetCompanies: string[]
  reasoning: string
  estimatedValue: number
  confidence: number
  priority: number
}

// Generative Report Types
export interface GenerativeReport {
  id: string
  title: string
  type: 'portfolio' | 'market' | 'prospect' | 'competitive' | 'custom'
  sections: ReportSection[]
  insights: GenerativeInsight[]
  recommendations: string[]
  metadata: {
    generatedAt: string
    generatedBy: string
    dataRange: { start: string; end: string }
    prospectCount: number
    sources: string[]
  }
  format: 'markdown' | 'html' | 'pdf'
  content: string
}

export interface ReportSection {
  id: string
  title: string
  content: string
  visualizations?: Visualization[]
  data?: Record<string, any>
  subsections?: ReportSection[]
}

export interface Visualization {
  type: 'chart' | 'graph' | 'table' | 'map' | 'network'
  config: Record<string, any>
  data: any[]
}

// Recursive Agentic Improvement Types
export interface RecursiveImprovement {
  id: string
  depth: number
  parentImprovementId?: string
  improvement: {
    category: string
    description: string
    impact: string
    safetyScore: number
  }
  triggeredImprovements: RecursiveImprovement[]
  executedAt: string
  results: {
    success: boolean
    metrics: Record<string, number>
    newOpportunities: string[]
  }
}

export interface ImprovementTree {
  rootImprovement: RecursiveImprovement
  totalDepth: number
  totalImprovements: number
  compoundImpact: number
  emergentCapabilities: string[]
}

// Recursive Data Quality Types
export interface DataQualityIssue {
  id: string
  prospectId: string
  field: string
  issueType: 'missing' | 'invalid' | 'stale' | 'inconsistent' | 'low_confidence'
  severity: 'critical' | 'high' | 'medium' | 'low'
  detectedAt: string
  suggestedFix?: string
}

export interface RecursiveDataQualityResult {
  prospectId: string
  issuesFound: DataQualityIssue[]
  issuesFixed: DataQualityIssue[]
  iterations: number
  qualityScore: {
    before: number
    after: number
    improvement: number
  }
  cascadingFixes: number
}
