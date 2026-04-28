-- gamification.sql - Queries for hunter profile, stats, achievements, and daily quests.
-- Author: Subash Karki

-- name: GetHunterProfile :one
SELECT * FROM hunter_profile WHERE id = 1;

-- name: UpdateHunterProfile :exec
UPDATE hunter_profile SET
    name = ?,
    level = ?,
    xp = ?,
    xp_to_next = ?,
    rank = ?,
    title = ?,
    total_sessions = ?,
    total_tasks = ?,
    total_repos = ?,
    streak_current = ?,
    streak_best = ?,
    last_active_date = ?
WHERE id = 1;

-- name: UpdateHunterName :exec
UPDATE hunter_profile SET name = ? WHERE id = 1;

-- name: IncrementTotalSessions :exec
UPDATE hunter_profile SET total_sessions = COALESCE(total_sessions, 0) + 1 WHERE id = 1;

-- name: IncrementTotalTasks :exec
UPDATE hunter_profile SET total_tasks = COALESCE(total_tasks, 0) + 1 WHERE id = 1;

-- name: IncrementTotalRepos :exec
UPDATE hunter_profile SET total_repos = COALESCE(total_repos, 0) + 1 WHERE id = 1;

-- name: UpdateStreak :exec
UPDATE hunter_profile SET
    streak_current = ?,
    streak_best = ?,
    last_active_date = ?
WHERE id = 1;

-- name: UpdateHunterXP :exec
UPDATE hunter_profile SET
    xp = ?,
    level = ?,
    xp_to_next = ?,
    rank = ?,
    title = ?
WHERE id = 1;

-- name: EnsureHunterProfile :exec
INSERT OR IGNORE INTO hunter_profile (id, name, level, xp, xp_to_next, rank, title, total_sessions, total_tasks, total_repos, streak_current, streak_best, created_at)
VALUES (1, 'Hunter', 1, 0, 100, 'F', 'Awakened', 0, 0, 0, 0, 0, unixepoch() * 1000);

-- name: GetHunterStats :one
SELECT * FROM hunter_stats WHERE id = 1;

-- name: EnsureHunterStats :exec
INSERT OR IGNORE INTO hunter_stats (id, strength, intelligence, agility, vitality, perception, sense)
VALUES (1, 10, 10, 10, 10, 10, 10);

-- name: IncrementStat :exec
UPDATE hunter_stats SET
    strength = CASE WHEN @stat = 'strength' THEN COALESCE(strength, 10) + @amount ELSE strength END,
    intelligence = CASE WHEN @stat = 'intelligence' THEN COALESCE(intelligence, 10) + @amount ELSE intelligence END,
    agility = CASE WHEN @stat = 'agility' THEN COALESCE(agility, 10) + @amount ELSE agility END,
    vitality = CASE WHEN @stat = 'vitality' THEN COALESCE(vitality, 10) + @amount ELSE vitality END,
    perception = CASE WHEN @stat = 'perception' THEN COALESCE(perception, 10) + @amount ELSE perception END,
    sense = CASE WHEN @stat = 'sense' THEN COALESCE(sense, 10) + @amount ELSE sense END
WHERE id = 1;

-- name: ListAchievements :many
SELECT * FROM achievements ORDER BY category, name;

-- name: GetAchievement :one
SELECT * FROM achievements WHERE id = ?;

-- name: UpsertAchievement :exec
INSERT INTO achievements (id, name, description, icon, category, xp_reward, unlocked_at)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    icon = excluded.icon,
    category = excluded.category,
    xp_reward = excluded.xp_reward;

-- name: UnlockAchievement :exec
UPDATE achievements SET unlocked_at = ? WHERE id = ?;

-- name: ListDailyQuests :many
SELECT * FROM daily_quests WHERE date = ?;

-- name: CreateDailyQuest :exec
INSERT INTO daily_quests (id, date, quest_type, label, target, progress, completed, xp_reward)
VALUES (?, ?, ?, ?, ?, 0, 0, ?);

-- name: UpdateQuestProgress :exec
UPDATE daily_quests SET progress = ?, completed = ? WHERE id = ?;

-- name: GetSessionCountForDate :one
SELECT COUNT(*) as cnt FROM sessions
WHERE started_at >= ? AND started_at < ?;

-- name: GetCompletedTaskCountForDate :one
SELECT COUNT(*) as cnt FROM tasks
WHERE status = 'completed' AND updated_at >= ? AND updated_at < ?;

-- name: GetSpeedTaskCountForDate :one
SELECT COUNT(*) as cnt FROM tasks
WHERE status = 'completed'
  AND updated_at >= ? AND updated_at < ?
  AND (updated_at - created_at) < 120000;

-- name: GetUniqueRepoCountForDate :one
SELECT COUNT(DISTINCT repo) as cnt FROM sessions
WHERE started_at >= ? AND started_at < ?
  AND repo IS NOT NULL;

-- name: GetLongSessionCountForDate :one
SELECT COUNT(*) as cnt FROM sessions
WHERE started_at >= ? AND started_at < ?
  AND ended_at IS NOT NULL
  AND (ended_at - started_at) > 3600000;

-- name: GetPerfectSessionCountForDate :one
SELECT COUNT(*) as cnt FROM sessions
WHERE started_at >= ? AND started_at < ?
  AND task_count > 0
  AND completed_tasks = task_count;

-- name: GetUniqueRepoCount :one
SELECT COUNT(DISTINCT repo) as cnt FROM sessions WHERE repo IS NOT NULL;

-- name: GetLifetimeStats :one
SELECT
    COUNT(*) as total_sessions,
    COALESCE(SUM(input_tokens + output_tokens), 0) as total_tokens,
    COALESCE(SUM(estimated_cost_micros), 0) as total_cost
FROM sessions;

-- name: GetModelBreakdown :many
SELECT
    model,
    COUNT(*) as sessions,
    COALESCE(SUM(input_tokens + output_tokens), 0) as tokens,
    COALESCE(SUM(estimated_cost_micros), 0) as cost
FROM sessions
WHERE model IS NOT NULL
GROUP BY model;

-- name: GetDailyActivity :many
SELECT
    date,
    COALESCE(session_count, 0) as session_count,
    COALESCE(total_duration_secs, 0) as total_duration_secs,
    COALESCE(total_cost_micros, 0) as total_cost_micros
FROM daily_stats
ORDER BY date DESC
LIMIT ?;

-- name: GetTotalSpeedTasks :one
SELECT COUNT(*) as cnt FROM tasks
WHERE status = 'completed'
  AND (updated_at - created_at) < 120000;

-- name: GetTotalXPEarned :one
SELECT COALESCE(SUM(xp_earned), 0) as total_xp FROM activity_log;

-- name: LogActivity :exec
INSERT INTO activity_log (timestamp, type, session_id, metadata, xp_earned, provider)
VALUES (?, ?, ?, ?, ?, 'gamification');
