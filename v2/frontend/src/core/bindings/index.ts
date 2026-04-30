// Author: Subash Karki

export { getSessions, getActiveSessions, getSession, getSessionTasks, getActivityLog, parseSessionHistory, pauseSession, resumeSession, killSession, setSessionPolicy, getSessionState } from './sessions';
export { createTerminal, writeTerminal, writeBubbleteaProgram, resizeTerminal, destroyTerminal, restoreTerminal, destroyTerminalsForWorktree, listTerminalsForWorktree, getTerminalSnapshots, getTerminalScrollback, subscribeTerminal, unsubscribeTerminal, listTerminals, runRecipe, runBubbleteaProgram, runTerminalCommand } from './terminal';
export type { TerminalInfo, TerminalSnapshot } from './terminal';
export { getProjects, addProject, detectProject, getProjectRecipes, listWorktrees, getAllWorktreeStatus, removeProject, browseDirectory, scanDirectory, cloneRepository, isGitRepo, initGitRepo, toggleStarProject } from './projects';
export { getPreference, setPreference, getGitUserName } from './preferences';
export { healthCheck } from './health';
export {
  getProjectBranches,
  createWorktree,
  removeWorktree,
  gitFetch,
  gitPull,
  gitPush,
  gitCheckoutBranch,
  gitStage,
  gitStageAll,
  gitUnstage,
  gitCommit,
  gitDiscard,
  renameWorktree,
  getWorkspaceStatus,
  refreshWorkspaceStatus,
  getWorkspaceChanges,
  getWorkspaceCommitLog,
  listWorkspaceFiles,
  listWorkspaceDir,
  searchWorkspaceFiles,
  getPrStatus,
  getCiRuns,
  getCiRunsForBranch,
  getCheckAnnotations,
  getFailedSteps,
  createPrWithAI,
  isGhCliAvailable,
  getBranchCommits,
  listOpenPrs,
  watchWorktree,
} from './git';
export { revealInFinder, openInFinder, openInDefaultApp, openURL } from './shell';
export { getWards, saveWardRule, deleteWardRule, toggleWardRule, getWardPresets, applyWardPreset } from './wards';
export type { WardRule, WardPreset } from './wards';
export { readFileContents, writeFileContents, getFileAtRevision, getWorkspaceBlame, createFile, createFolder, deleteFile } from './editor';
export { getSessionsByDate, getSessionsByProject, getRecentSessions, getDailyStatsRange, getDailyStatsRangeByProject, getLastActiveSession, getDailyJournalEntry, generateMorningBrief, generateEndOfDay, updateJournalNotes, listJournalDates } from './journal';
export { getProviders, getProviderDetail, setProviderEnabled, setActiveProvider, testProvider, autoDetectProviders, addCustomProvider, removeCustomProvider, resetProviderOverride, getActiveProvider } from './providers';
export { getConversations, createConversation, deleteConversation, sendChatMessage, getChatHistory } from './chat';
export { getAllRecipes, createCustomRecipe, updateCustomRecipe, deleteCustomRecipe, toggleRecipeFavorite, getFavoriteRecipes } from './recipes';
export { getHunterProfile, getHunterStats, updateHunterName, getAchievements, getDailyQuests, getHunterDashboard, getActivityHeatmap } from './gamification';
export { getAIInsight } from './ai-insight';
export type { AIInsightData, StrategyInfo, AssessmentInfo, ContextCoverage, KnowledgeStats, DecisionEntry } from './ai-insight';
export { getEvolution } from './evolution';
export type { EvolutionData, GapAlert, StrategyTrend } from './evolution';
export { listMCPServers, toggleMCPServer, registerPhantomMCP } from './mcp';
export type { MCPServer } from './mcp';
