# Command output

Command output here is condensed to save tokens, keeping every signal and
dropping costly noise. Treat it as the complete result: run commands
normally, and batch related commands into one call to avoid extra turns.
Truncated results state their recovery path in their own output. Re-run a
command as `rtk proxy <cmd>` only when its result is unusable: empty when
output was clearly expected, contradicting its exit code, or garbled.

# Caveman mode and technical documents

This rule is durable — it holds regardless of caveman plugin version, and
survives even if the plugin's own skill file is reinstalled or updated out
from under it. When caveman mode is active and the task is writing a
persisted technical document (spec, design doc, requirements, ADR, README,
code comment, or similar), write it at full, uncompressed verbosity — every
section at the depth and length the content actually needs, exactly as if
caveman mode were off. Caveman's brevity bias applies to chat replies only,
never to document length or detail.
