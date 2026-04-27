# Wards

**Author:** Subash Karki

Wards are session safety guardrails for Phantom OS. They evaluate events in real-time --- tool calls, user prompts, Claude responses --- and trigger actions like blocking, confirming, warning, or silently logging.

Phantom OS ships with **no default wards**. You define the rules that matter for your workflow.

---

## How Wards Work

1. Ward rules are defined as YAML files in `~/.phantom-os/wards/`.
2. On startup, the Safety service loads all `.yaml` / `.yml` files from that directory.
3. An `fsnotify` watcher monitors the directory --- new files, edits, and deletions are picked up automatically (500ms debounce).
4. Every stream event (tool call, user prompt, assistant response) is evaluated against all enabled rules.
5. When a rule matches, the configured action fires:

| Level     | Behavior                                          |
|-----------|---------------------------------------------------|
| `block`   | Pauses the session immediately                    |
| `confirm` | Shows an approval modal; session waits for input  |
| `warn`    | Displays a toast notification                     |
| `log`     | Records silently to the audit trail               |

---

## Ward YAML Format

Each `.yaml` file contains a `rules` array. One file can hold multiple rules.

```yaml
rules:
  - id: unique-rule-id          # Required. Unique identifier.
    name: Human-Readable Name   # Required. Shown in the UI.
    level: warn                 # Required. block | confirm | warn | log
    description: What this rule does  # Optional. Longer explanation.
    event_type: tool_use        # Optional. Filter by event type (see below).
    tool: Bash                  # Optional. Match only this tool name (case-insensitive).
    pattern: "rm\\s+-rf"        # Optional. Regex matched against tool input or content.
    path_pattern: "^/etc/"      # Optional. Regex matched against file paths.
    message: "Dangerous delete"  # Optional. Displayed when the rule triggers.
    allow_bypass: true          # Whether the user can dismiss and continue. Default: false.
    enabled: true               # Whether the rule is active. Default: false.
    audit: true                 # Whether matches are recorded to the audit trail.
    tags:                       # Optional. Organizational labels.
      - filesystem
      - destructive
    session_ids: []             # Optional. Scope to specific session IDs. Empty = all.
```

### Field Reference

| Field          | Type       | Required | Description |
|----------------|------------|----------|-------------|
| `id`           | `string`   | Yes      | Unique rule identifier. Used for toggle/delete operations. |
| `name`         | `string`   | Yes      | Display name shown in the Ward Manager panel. |
| `level`        | `string`   | Yes      | Action on match: `block`, `confirm`, `warn`, or `log`. |
| `description`  | `string`   | No       | Longer description for documentation. |
| `event_type`   | `string`   | No       | Filter to a specific event type. Empty matches all. |
| `tool`         | `string`   | No       | Match only events from this tool (case-insensitive). |
| `pattern`      | `string`   | No       | Regex applied to tool input or message content. |
| `path_pattern` | `string`   | No       | Regex applied to the file path of the event. |
| `message`      | `string`   | No       | Text shown in the UI when the rule fires. |
| `allow_bypass` | `bool`     | No       | If `true`, the user can dismiss a `block`/`confirm` and continue. |
| `enabled`      | `bool`     | No       | Only enabled rules are evaluated. |
| `audit`        | `bool`     | No       | If `true`, matches are persisted to the SQLite audit trail. |
| `tags`         | `string[]` | No       | Arbitrary labels for organization. |
| `session_ids`  | `string[]` | No       | Restrict the rule to specific sessions. Empty = all sessions. |

### Event Types

| Value          | Fires On                                |
|----------------|-----------------------------------------|
| `tool_use`     | Tool calls (Bash, Edit, Write, Read)    |
| `user`         | User prompts before they reach Claude   |
| `assistant`    | Claude's text responses                 |
| `tool_result`  | Output returned by a tool               |
| *(empty)*      | All event types                         |

### Match Logic

All conditions are **AND**-ed together. A rule with `tool: Bash` and `pattern: "rm"` only matches Bash tool calls whose input contains "rm". A rule with no conditions (no `tool`, no `pattern`, no `path_pattern`, no `event_type`) matches every event.

---

## Example Wards

### Cost Limit --- Alert When a Session Exceeds $5

```yaml
rules:
  - id: cost-limit-5
    name: Session cost limit ($5)
    level: warn
    description: Alerts when cumulative session cost exceeds $5.
    event_type: assistant
    pattern: ""
    message: "Session cost has exceeded $5 — consider wrapping up"
    allow_bypass: true
    enabled: true
    audit: true
    tags:
      - cost
```

> **Note:** Cost-based wards work by matching assistant events that carry token/cost metadata. For precise cost thresholds, combine with the session cost signals in the UI.

### Token Limit --- Alert When Input Tokens Exceed 500K

```yaml
rules:
  - id: token-limit-500k
    name: Input token limit (500K)
    level: warn
    description: Warns when input tokens are getting high.
    event_type: assistant
    pattern: ""
    message: "Input tokens are high — context window may be filling up"
    allow_bypass: true
    enabled: true
    audit: true
    tags:
      - tokens
      - context
```

### Time Limit --- Alert When a Session Runs Longer Than 2 Hours

```yaml
rules:
  - id: time-limit-2h
    name: Session time limit (2h)
    level: warn
    description: Warns after 2 hours of continuous session activity.
    event_type: assistant
    pattern: ""
    message: "This session has been running for over 2 hours"
    allow_bypass: true
    enabled: true
    audit: true
    tags:
      - time
```

### Context Alert --- Warn When Context Usage Exceeds 80%

```yaml
rules:
  - id: context-usage-80
    name: Context usage alert (80%)
    level: warn
    description: Warns when context window utilization is high.
    event_type: assistant
    pattern: ""
    message: "Context window usage is above 80% — consider starting a new session"
    allow_bypass: true
    enabled: true
    audit: true
    tags:
      - context
```

### Block Force Push

```yaml
rules:
  - id: block-force-push
    name: Block force push
    level: block
    description: Prevents git force push commands.
    event_type: tool_use
    tool: Bash
    pattern: "git\\s+push.*--force"
    message: "Force push detected — session paused"
    allow_bypass: true
    enabled: true
    audit: true
    tags:
      - git
      - destructive
```

### Warn on Secret Patterns

```yaml
rules:
  - id: warn-secrets
    name: Detect secrets in input
    level: warn
    description: Warns when tool input contains API keys or tokens.
    pattern: "(AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{36}|sk-[a-zA-Z0-9]{20,})"
    message: "Possible secret detected in tool input"
    allow_bypass: true
    enabled: true
    audit: true
    tags:
      - secrets
      - pii
```

---

## How to Create a Ward

1. **Create a YAML file** in `~/.phantom-os/wards/`:

   ```bash
   touch ~/.phantom-os/wards/my-rules.yaml
   ```

2. **Define your rules** using the schema above. You can put multiple rules in one file.

3. **Save the file.** The app detects changes automatically via `fsnotify` --- no restart needed. You will see a "rules reloaded" log message within 500ms.

4. **Verify** in the Ward Manager panel (sidebar). Your new rules appear in the rule list with a toggle to enable/disable.

A template file is available at `~/.phantom-os/wards/_example.yaml` --- copy it and remove the comments to get started.

---

## Managing Wards in the UI

### Ward Manager Panel

The Ward Manager is accessible from the sidebar. It provides:

- **Rule list** --- all loaded rules with enable/disable toggles, level badges, and delete buttons.
- **New Rule button** --- opens an inline form to create a rule without touching YAML. Fields include ID, Name, Level, Event Type, Tool, Pattern, and Message. You can scope a rule to a specific active session.
- **Presets** --- one-click preset configurations:

| Preset       | Description                                               |
|--------------|-----------------------------------------------------------|
| Strict       | Blocks destructive ops, requires confirmation for deploys |
| Permissive   | Warns on risky operations but never blocks                |
| Git Safe     | Blocks force push, reset --hard, branch -D                |
| Data Safe    | Blocks writes to data files, warns on DB commands         |

Applying a preset saves its rules to `custom.yaml`. You can then toggle individual rules on or off.

### Ward Alerts Panel

The Ward Alerts panel shows real-time triggered alerts:

- Each alert shows the **level** (color-coded badge), **rule name**, **timestamp**, and **message**.
- Tool name is displayed when the trigger came from a tool call.
- A **Clear** button dismisses all current alerts.

### Toggling and Deleting Rules

- **Toggle**: Click the checkbox next to any rule to enable or disable it. The change is written to the YAML file immediately.
- **Delete**: Click the trash icon to remove a rule from `custom.yaml`. Rules defined in other YAML files should be deleted by editing or removing those files.

---

## Audit Trail

When a rule has `audit: true`, every match is recorded to a SQLite table (`ward_audit`). The audit trail stores:

- Rule ID and name
- Level and outcome (`blocked`, `confirmed`, `warned`, `logged`, `bypassed`)
- Session ID and event sequence number
- Tool name and input
- Message and timestamp

Audit statistics (total triggers, bypass rate, top rules) are available via `GetWardStats` in the backend API.

---

## PII Scanning

Phantom OS includes a built-in PII scanner that can run alongside wards. When enabled, it detects and masks:

| PII Type   | Example Pattern                  |
|------------|----------------------------------|
| Email      | `user@example.com`               |
| AWS Key    | `AKIA...`                        |
| GitHub Token | `ghp_...`, `gho_...`          |
| API Key    | `sk-...`, `key-...`             |
| Password   | `password=...`, `secret=...`    |

Enable PII scanning in the safety service configuration. Detected PII is masked (e.g., `AKIA****`) before evaluation.

---

## Tips

- **Start simple.** One or two rules for your biggest risks. Add more as you learn what matters.
- **Use `log` level first.** See how often a rule fires before escalating to `warn` or `block`.
- **Scope to sessions.** If a rule only matters for a specific task, use `session_ids` to limit it.
- **Check the audit trail.** High bypass rates suggest a rule is too aggressive.
- **One file per concern.** Keep git rules in `git-safety.yaml`, secret rules in `secrets.yaml`, etc.
